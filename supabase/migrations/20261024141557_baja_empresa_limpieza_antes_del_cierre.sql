-- Keep the account active while authorized cleanup runs inside the same locked transaction.
-- The enclosing safe function serializes deletion against contracting.
begin;
CREATE OR REPLACE FUNCTION private.eliminar_mi_cuenta_original()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 'pendiente' es el estado con el que nacen las ofertas (ver crearOferta);
  -- los otros dos se mantienen por si quedan filas antiguas.
  update public.ofertas set estado = 'retirada'
  where profesional_id = yo and estado in ('pendiente', 'enviada', 'en_negociacion');

  delete from public.portfolio where profesional_id = yo;
  delete from public.favoritos where cliente_id = yo or profesional_id = yo;
  delete from public.notificaciones where usuario_id = yo;
  delete from public.eventos_calendario where usuario_id = yo;

  update public.profiles
  set foto_perfil = null,
      foto_portada = null,
      bio = null,
      email_notificaciones = false,
      cuenta_eliminada = now(),
      updated_at = now()
  where id = yo;

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
$function$;

commit;
