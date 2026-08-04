-- Borrado de cuenta por el propio usuario, desde la app.
--
-- Lo exige Apple para publicar en la App Store (guía 5.1.1(v)): no vale con
-- pedirlo a soporte, tiene que poder completarlo la persona. También es el
-- derecho de supresión del RGPD.
--
-- POR QUÉ NO SE BORRA NINGUNA FILA DE VERDAD:
-- media base de datos cuelga en cascada de `profiles` y de `profesionales`.
--
--   profiles.id            -> auth.users(id)      ON DELETE CASCADE
--   trabajos.profesional_id -> profesionales(id)  ON DELETE CASCADE
--   ofertas, portfolio, reseñas, transacciones_escrow  -> ídem
--
-- Es decir: borrar auth.users se lleva el perfil, y borrar el perfil (o solo la
-- ficha de profesional) se lleva por delante los TRABAJOS Y LAS FACTURAS DE LA
-- OTRA PARTE. Se comprobó en una transacción de prueba: al hacer
-- `delete from profesionales` desaparecían también el trabajo, la oferta, la
-- transacción de escrow y la reseña del cliente.
--
-- Así que aquí no se borra nada que sostenga historial: se ANONIMIZA. La persona
-- desaparece de la web y no puede volver a entrar, pero las cuentas de terceros
-- siguen cuadrando y los registros contables se conservan, como obliga la ley.
--
-- Lo que sí se borra es lo que es solo suyo y no cuelga nadie: portfolio,
-- favoritos, notificaciones, eventos de calendario y, sobre todo, la identidad
-- de acceso (auth.identities) — sin ella no hay forma de iniciar sesión.

create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := auth.uid();
  trabajos_vivos integer;
  disputas_vivas integer;
begin
  if yo is null then
    raise exception 'No autenticado';
  end if;

  -- No se puede desaparecer dejando un trabajo a medias o dinero en custodia:
  -- la otra parte se quedaría sin nadie con quien resolverlo.
  select count(*) into trabajos_vivos
  from public.trabajos t
  where (t.cliente_id = yo or t.profesional_id = yo)
    and t.estado in ('pendiente_pago', 'en_progreso', 'entregado', 'en_disputa');

  if trabajos_vivos > 0 then
    raise exception 'Tienes % trabajo(s) en curso o con el pago en custodia. Termínalos o cancélalos antes de eliminar la cuenta.', trabajos_vivos;
  end if;

  select count(*) into disputas_vivas
  from public.disputas d
  where (d.cliente_id = yo or d.profesional_id = yo) and d.estado = 'abierta';

  if disputas_vivas > 0 then
    raise exception 'Tienes % disputa(s) abierta(s). Hay que resolverlas antes de eliminar la cuenta.', disputas_vivas;
  end if;

  -- Perfil: se va todo lo que identifica a la persona y queda el hueco para que
  -- los trabajos y facturas de terceros no se rompan.
  update public.profiles
  set nombre = 'Usuario',
      apellido = 'eliminado',
      email = 'eliminado+' || yo::text || '@diime.es',
      telefono = null,
      documento = null,
      foto_perfil = null,
      foto_portada = null,
      bio = null,
      ubicacion = null,
      cargo_empresa = null,
      empresa_id = null,
      email_notificaciones = false,
      updated_at = now()
  where id = yo;

  -- Ficha profesional: mismo motivo, se vacía en vez de borrarse.
  -- `disponible = false` es lo que la saca del listado de Profesionales, y
  -- `categorias_interes = '{}'` lo que impide que le sigan llegando avisos de
  -- demandas nuevas (el emparejamiento filtra por ese array).
  update public.profesionales
  set titulo = 'Cuenta eliminada',
      tarifa_por_hora = null,
      "años_experiencia" = null,
      idiomas = '{}',
      certificaciones = '[]'::jsonb,
      habilidades = '[]'::jsonb,
      categorias_interes = '{}',
      provincias_cobertura = '{}',
      disponible = false,
      updated_at = now()
  where id = yo;

  -- Contenido propio, del que no cuelga nada de nadie.
  delete from public.portfolio where profesional_id = yo;
  delete from public.favoritos where cliente_id = yo or profesional_id = yo;
  delete from public.notificaciones where usuario_id = yo;
  delete from public.eventos_calendario where usuario_id = yo;

  -- La identidad de acceso: sin esto podría seguir entrando con Google.
  delete from auth.identities where user_id = yo;

  -- Y la fila de auth.users se neutraliza en vez de borrarse (borrarla
  -- cascadearía a `profiles`). Sin contraseña, sin correo real y baneada: no
  -- hay ninguna vía de volver a entrar. El correo original queda libre, así que
  -- puede registrarse de nuevo si algún día quiere.
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
