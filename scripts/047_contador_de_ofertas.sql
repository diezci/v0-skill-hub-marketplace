-- Cuántas ofertas tiene cada demanda, y corrección de la baja de cuenta.
--
-- 1) EL CONTADOR DE OFERTAS NUNCA HA FUNCIONADO
--
-- `crearOferta` llamaba a `increment_total_ofertas(...)`, una función que no
-- existe en esta base de datos, y el error se ignoraba. Comprobado al probar el
-- flujo: 10 de 10 demandas con ofertas tenían `total_ofertas` mal.
--
-- Y el listado de /demandas, que lo recalculaba con un SELECT normal, tampoco
-- acertaba: la RLS de `ofertas` solo deja ver las propias y las de las demandas
-- de uno, así que un profesional veía "0 ofertas" en TODAS las demandas ajenas,
-- tuvieran las que tuvieran. Saber con cuántos compites es justo lo que hace
-- falta para decidir si merece la pena pujar.
--
-- La función devuelve SOLO el número: de aquí no sale quién ha pujado ni por
-- cuánto, así que no abre nada que la RLS estuviera protegiendo.

create or replace function public.contar_ofertas_por_solicitud(p_ids uuid[])
returns table (solicitud_id uuid, total bigint)
language sql
security definer
set search_path = public
stable
as $$
  select o.solicitud_id, count(*)::bigint
  from public.ofertas o
  where o.solicitud_id = any(p_ids)
    and o.estado not in ('retirada', 'rechazada')
  group by o.solicitud_id;
$$;

revoke all on function public.contar_ofertas_por_solicitud(uuid[]) from public;
revoke all on function public.contar_ofertas_por_solicitud(uuid[]) from anon;
grant execute on function public.contar_ofertas_por_solicitud(uuid[]) to authenticated;

-- Poner al día el contador guardado.
update public.solicitudes s
set total_ofertas = coalesce((
  select count(*) from public.ofertas o
  where o.solicitud_id = s.id and o.estado not in ('retirada', 'rechazada')
), 0);

-- 2) LA BAJA DE CUENTA NO RETIRABA LAS PUJAS VIVAS
--
-- `eliminar_mi_cuenta` (scripts/046) retiraba las ofertas en 'enviada' y
-- 'en_negociacion', pero la aplicación las crea en 'pendiente' (ver
-- `crearOferta`), que es el valor que usa también `rechazarYNotificarOfertas-
-- Perdedoras`. Resultado: quien se daba de baja dejaba sus pujas en pie y un
-- cliente podía contratar a alguien que ya no existe. El contador del aviso
-- previo decía "0 pujas" por el mismo motivo.

create or replace function public.consecuencias_de_eliminar_mi_cuenta()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  r json;
begin
  if yo is null then
    raise exception 'No autenticado';
  end if;

  select json_build_object(
    'es_profesional', exists(select 1 from public.profesionales where id = yo),

    'demandas_a_borrar', (
      select count(*) from public.solicitudes s
      where s.cliente_id = yo and s.estado = 'abierta'
        and not exists (select 1 from public.trabajos t where t.solicitud_id = s.id)
    ),

    'ofertas_a_retirar', (
      select count(*) from public.ofertas o
      where o.profesional_id = yo and o.estado in ('pendiente', 'enviada', 'en_negociacion')
    ),

    'trabajos_proveedor', (
      select count(*) from public.trabajos t
      where t.profesional_id = yo and t.estado in ('pendiente_pago', 'en_progreso', 'entregado')
    ),
    'importe_a_devolver', (
      select coalesce(sum(e.monto), 0) from public.trabajos t
      join public.transacciones_escrow e on e.trabajo_id = t.id and e.estado = 'fondos_retenidos'
      where t.profesional_id = yo and t.estado in ('pendiente_pago', 'en_progreso', 'entregado')
    ),

    'trabajos_cliente_con_dinero', (
      select count(*) from public.trabajos t
      where t.cliente_id = yo and t.estado in ('en_progreso', 'entregado')
    ),
    'importe_en_custodia', (
      select coalesce(sum(e.monto), 0) from public.trabajos t
      join public.transacciones_escrow e on e.trabajo_id = t.id and e.estado = 'fondos_retenidos'
      where t.cliente_id = yo and t.estado in ('en_progreso', 'entregado')
    ),

    'trabajos_cliente_sin_pagar', (
      select count(*) from public.trabajos t
      where t.cliente_id = yo and t.estado = 'pendiente_pago'
    ),

    'disputas_abiertas', (
      select count(*) from public.disputas d
      where (d.cliente_id = yo or d.profesional_id = yo) and d.estado = 'abierta'
    )
  ) into r;

  return r;
end;
$$;

revoke all on function public.consecuencias_de_eliminar_mi_cuenta() from public;
revoke all on function public.consecuencias_de_eliminar_mi_cuenta() from anon;
grant execute on function public.consecuencias_de_eliminar_mi_cuenta() to authenticated;

create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  disputas_vivas integer;
begin
  if yo is null then
    raise exception 'No autenticado';
  end if;

  select count(*) into disputas_vivas
  from public.disputas d
  where (d.cliente_id = yo or d.profesional_id = yo) and d.estado = 'abierta';

  if disputas_vivas > 0 then
    raise exception 'Tienes % disputa(s) abierta(s). Hay que resolverlas antes de darte de baja: si desapareces, la otra parte se queda sin nadie con quien cerrarlas.', disputas_vivas;
  end if;

  update public.profiles
  set foto_perfil = null,
      foto_portada = null,
      bio = null,
      email_notificaciones = false,
      cuenta_eliminada = now(),
      updated_at = now()
  where id = yo;

  update public.profesionales
  set tarifa_por_hora = null,
      "años_experiencia" = null,
      idiomas = '{}',
      certificaciones = '[]'::jsonb,
      habilidades = '[]'::jsonb,
      categorias_interes = '{}',
      provincias_cobertura = '{}',
      disponible = false,
      updated_at = now()
  where id = yo;

  delete from public.solicitudes s
  where s.cliente_id = yo and s.estado = 'abierta'
    and not exists (select 1 from public.trabajos t where t.solicitud_id = s.id);

  update public.solicitudes set estado = 'cancelada'
  where cliente_id = yo and estado = 'abierta';

  -- 'pendiente' es el estado con el que nacen las ofertas; los otros dos se
  -- mantienen por si quedan filas antiguas.
  update public.ofertas set estado = 'retirada'
  where profesional_id = yo and estado in ('pendiente', 'enviada', 'en_negociacion');

  delete from public.portfolio where profesional_id = yo;
  delete from public.favoritos where cliente_id = yo or profesional_id = yo;
  delete from public.notificaciones where usuario_id = yo;
  delete from public.eventos_calendario where usuario_id = yo;

  delete from auth.identities where user_id = yo;

  update auth.users
  set email = 'eliminado+' || yo::text || '@diime.es',
      phone = null,
      encrypted_password = null,
      email_change = '',
      phone_change = '',
      confirmation_token = '',
      recovery_token = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz,
      updated_at = now()
  where id = yo;
end;
$$;

revoke all on function public.eliminar_mi_cuenta() from public;
revoke all on function public.eliminar_mi_cuenta() from anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
