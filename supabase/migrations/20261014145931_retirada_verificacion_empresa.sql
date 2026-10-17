-- Una retirada crea un nuevo expediente; la aprobación anterior sigue intacta.
create function diime_private.empresa_retirar_verificacion(p_empresa_id uuid, p_verificacion_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.empresas; v diime_private.empresa_verificaciones; nueva uuid;
begin
  if not diime_private.empresa_admin_plataforma() then
    raise exception 'Solo el equipo administrador de Diime puede retirar una verificación' using errcode='42501';
  end if;
  if nullif(btrim(p_motivo),'') is null or length(btrim(p_motivo))<8 or length(p_motivo)>2000 then
    raise exception 'Explica el motivo de la retirada entre 8 y 2000 caracteres' using errcode='22023';
  end if;
  select * into e from public.empresas where id=p_empresa_id for update;
  if e.id is null or e.estado_verificacion <> 'verificada' then
    raise exception 'La empresa ya no tiene una verificación activa. Actualiza la lista' using errcode='55000';
  end if;
  select * into v from diime_private.empresa_verificaciones where empresa_id=e.id order by creada_at desc limit 1 for update;
  if v.id is null or v.estado <> 'verificada' or p_verificacion_id is distinct from v.id then
    raise exception 'El expediente ha cambiado. Actualiza la lista antes de retirar la verificación' using errcode='22023';
  end if;
  if e.propietario_id=auth.uid() or v.responsable_usuario_id=auth.uid() then
    raise exception 'Otro administrador debe revisar la verificación de tu propia empresa' using errcode='42501';
  end if;
  insert into diime_private.empresa_verificaciones(empresa_id,estado,metodo,representante_nombre,cargo_legal,responsable_usuario_id,documento_nombre,documento,nota_revision,revisada_por,revisada_at)
    values(e.id,'requiere_informacion',v.metodo,v.representante_nombre,v.cargo_legal,v.responsable_usuario_id,v.documento_nombre,v.documento,btrim(p_motivo),auth.uid(),now()) returning id into nueva;
  update public.empresas set estado_verificacion='requiere_informacion',verificada=false,updated_at=now() where id=e.id;
  perform diime_private.empresa_registrar_actividad(e.id,'Verificación retirada','verificacion',nueva,
    jsonb_build_object('verificacion_anterior_id',v.id,'motivo',btrim(p_motivo),'decision','requiere_informacion'));
  return nueva;
end; $$;
revoke all on function diime_private.empresa_retirar_verificacion(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function diime_private.empresa_retirar_verificacion(uuid,uuid,text) to authenticated;
create function public.empresa_retirar_verificacion(p_empresa_id uuid,p_verificacion_id uuid,p_motivo text)
returns uuid language sql security invoker set search_path='' as $$
  select diime_private.empresa_retirar_verificacion(p_empresa_id,p_verificacion_id,p_motivo);
$$;
revoke all on function public.empresa_retirar_verificacion(uuid,uuid,text) from public,anon;
grant execute on function public.empresa_retirar_verificacion(uuid,uuid,text) to authenticated;

-- Serializar las nuevas operaciones con la retirada. No se modifica ni bloquea
-- el mantenimiento de contratos previos, sus cobros, cancelaciones o disputas.
create function diime_private.empresa_verificacion_para_nueva_operacion()
returns trigger language plpgsql security definer set search_path='' as $$
declare empresa_ids uuid[]; e record;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name in ('solicitudes','ofertas') then
    empresa_ids:=array[new.empresa_id];
  else
    empresa_ids:=array[(select empresa_id from public.solicitudes where id=new.solicitud_id),
                    (select empresa_id from public.ofertas where id=new.oferta_id)];
  end if;
  for e in select id,estado_verificacion from public.empresas where id=any(empresa_ids) order by id for share loop
    if e.estado_verificacion <> 'verificada' then
      raise exception 'La representación de la empresa debe estar verificada antes de iniciar una nueva operación' using errcode='42501';
    end if;
  end loop;
  return new;
end; $$;
revoke all on function diime_private.empresa_verificacion_para_nueva_operacion() from public,anon,authenticated,service_role;
-- El nombre ordena este bloqueo antes de los triggers de permisos y pertenencia.
create trigger aaa_empresa_verificacion_alta before insert on public.solicitudes for each row execute function diime_private.empresa_verificacion_para_nueva_operacion();
create trigger aaa_empresa_verificacion_alta before insert on public.ofertas for each row execute function diime_private.empresa_verificacion_para_nueva_operacion();
create trigger aaa_empresa_verificacion_alta before insert on public.trabajos for each row execute function diime_private.empresa_verificacion_para_nueva_operacion();
notify pgrst,'reload schema';
