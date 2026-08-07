-- Baja de cuenta pedida por el propio usuario, desde la app.
--
-- Lo exige Apple para publicar en la App Store (guía 5.1.1(v)): no vale con
-- pedirlo a soporte, tiene que poder completarlo la persona. También es el
-- derecho de supresión del RGPD.
--
-- QUÉ SE CONSERVA, Y POR QUÉ
-- Nombre, apellidos, NIF, dirección, correo y teléfono NO se borran. Con esos
-- datos se emitieron las facturas y son los que necesita la otra parte para
-- reclamar si algo acaba en los tribunales. El propio RGPD lo contempla
-- (art. 17.3.e: conservación para la formulación, el ejercicio o la defensa de
-- reclamaciones). Lo que se elimina es la PRESENCIA en la web: foto, portada,
-- descripción, ficha comercial, demandas publicadas y, sobre todo, el acceso.
--
-- QUÉ NO SE BORRA NUNCA (y por qué no se puede)
-- Media base de datos cuelga en cascada de `profiles` y de `profesionales`:
--
--   profiles.id             -> auth.users(id)      ON DELETE CASCADE
--   trabajos.profesional_id -> profesionales(id)   ON DELETE CASCADE
--   ofertas, portfolio, reseñas, transacciones_escrow -> ídem
--
-- Se comprobó en una transacción de prueba: al hacer `delete from profesionales`
-- desaparecían también el trabajo, la oferta, la transacción de escrow y la
-- reseña DEL CLIENTE. Por eso no se borra ninguna de esas dos filas.
--
-- QUÉ PASA CON EL DINERO
-- Aquí no, en `eliminarMiCuenta()` (app/actions/auth.ts): los reembolsos son
-- llamadas a Stripe y tienen que salir del servidor de la aplicación. Esta
-- función es el último paso, cuando el dinero ya está resuelto.

-- 1) Marca de cuenta dada de baja, para poder señalarla en la interfaz.
alter table public.profiles add column if not exists cuenta_eliminada timestamptz;

-- OJO: en scripts/043 se revocó el SELECT de tabla y se concedió columna a
-- columna. Una columna nueva NO hereda nada, así que sin este grant sería
-- ilegible para todo el mundo.
grant select (cuenta_eliminada) on public.profiles to anon, authenticated;

-- 2) Qué pasaría si me diera de baja. Alimenta el aviso previo, que tiene que
-- ser concreto ("2 demandas", "450 € que se te devuelven") y no genérico.
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
      where o.profesional_id = yo and o.estado in ('enviada', 'en_negociacion')
    ),

    -- Como proveedor: se cancela y se le devuelve al cliente todo lo pagado.
    'trabajos_proveedor', (
      select count(*) from public.trabajos t
      where t.profesional_id = yo and t.estado in ('pendiente_pago', 'en_progreso', 'entregado')
    ),
    'importe_a_devolver', (
      select coalesce(sum(e.monto), 0) from public.trabajos t
      join public.transacciones_escrow e on e.trabajo_id = t.id and e.estado = 'fondos_retenidos'
      where t.profesional_id = yo and t.estado in ('pendiente_pago', 'en_progreso', 'entregado')
    ),

    -- Como cliente con dinero ya en custodia: decide Diime.
    'trabajos_cliente_con_dinero', (
      select count(*) from public.trabajos t
      where t.cliente_id = yo and t.estado in ('en_progreso', 'entregado')
    ),
    'importe_en_custodia', (
      select coalesce(sum(e.monto), 0) from public.trabajos t
      join public.transacciones_escrow e on e.trabajo_id = t.id and e.estado = 'fondos_retenidos'
      where t.cliente_id = yo and t.estado in ('en_progreso', 'entregado')
    ),

    -- Como cliente sin haber pagado todavía: se cancela sin más.
    'trabajos_cliente_sin_pagar', (
      select count(*) from public.trabajos t
      where t.cliente_id = yo and t.estado = 'pendiente_pago'
    ),

    -- Esto sí impide la baja.
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

-- 3) La baja en sí.
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

  -- Único motivo que sigue impidiendo la baja. Los trabajos en curso ya no la
  -- bloquean: se resuelven antes (reembolso o revisión de Diime).
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

  -- Ficha profesional: se vacía lo comercial y deja de aparecer en el listado.
  -- `titulo` se queda porque sale en el contrato y la factura del cliente.
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

  -- Demandas publicadas que siguen abiertas: fuera. Solo las que no han llegado
  -- a trabajo; borrar una que ya tenga trabajo dejaría la factura sin el
  -- encargo (trabajos.solicitud_id es ON DELETE SET NULL).
  delete from public.solicitudes s
  where s.cliente_id = yo and s.estado = 'abierta'
    and not exists (select 1 from public.trabajos t where t.solicitud_id = s.id);

  -- Las que no se pueden borrar, al menos se cierran.
  update public.solicitudes set estado = 'cancelada'
  where cliente_id = yo and estado = 'abierta';

  -- Ofertas vivas en demandas de otros: se retiran, para que nadie contrate a
  -- alguien que ya no está.
  update public.ofertas set estado = 'retirada'
  where profesional_id = yo and estado in ('enviada', 'en_negociacion');

  -- Contenido propio, del que no cuelga nada de nadie.
  delete from public.portfolio where profesional_id = yo;
  delete from public.favoritos where cliente_id = yo or profesional_id = yo;
  delete from public.notificaciones where usuario_id = yo;
  delete from public.eventos_calendario where usuario_id = yo;

  -- Y el acceso. La identidad se borra (sin ella no hay forma de entrar) y la
  -- fila de auth.users se neutraliza en vez de borrarse, porque borrarla
  -- cascadearía a `profiles`. El correo de auth se libera para que la persona
  -- pueda registrarse de nuevo algún día; el de `profiles` se conserva porque
  -- es el que figura en las facturas ya emitidas.
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
