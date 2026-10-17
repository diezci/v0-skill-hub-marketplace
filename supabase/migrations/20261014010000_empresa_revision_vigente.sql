-- A review must identify the immutable dossier that the administrator actually read.
BEGIN;
DROP FUNCTION public.empresa_revisar_verificacion(uuid,text,text);
DROP FUNCTION diime_private.empresa_revisar_verificacion(uuid,text,text);
create function diime_private.empresa_revisar_verificacion(p_empresa_id uuid,p_decision text,p_nota text,p_verificacion_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v diime_private.empresa_verificaciones;
begin
  if not diime_private.empresa_admin_plataforma() then raise exception 'Solo el equipo administrador de Diime puede revisar la representación' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('verificada','requiere_informacion') or nullif(btrim(p_nota),'') is null or length(p_nota)>4000 then raise exception 'Indica una decisión y las comprobaciones realizadas' using errcode='22023'; end if;
  perform 1 from public.empresas where id=p_empresa_id for update;
  select * into v from diime_private.empresa_verificaciones where empresa_id=p_empresa_id and estado='en_revision' for update;
  if v.id is null then raise exception 'No hay una revisión pendiente para esta empresa' using errcode='55000'; end if;
  if p_verificacion_id is null or v.id is distinct from p_verificacion_id then
    raise exception 'La solicitud ha cambiado. Actualiza la lista y revisa el expediente vigente' using errcode='22023';
  end if;
  if v.responsable_usuario_id=auth.uid() then raise exception 'No puedes aprobar ni revisar tu propia solicitud' using errcode='42501'; end if;
  update diime_private.empresa_verificaciones set estado=p_decision,nota_revision=btrim(p_nota),revisada_por=auth.uid(),revisada_at=now() where id=v.id;
  update public.empresas set estado_verificacion=p_decision,verificada=p_decision='verificada',updated_at=now() where id=p_empresa_id;
  perform diime_private.empresa_registrar_actividad(p_empresa_id,'Representación revisada','verificacion',v.id,jsonb_build_object('decision',p_decision));
end; $$;
REVOKE ALL ON FUNCTION diime_private.empresa_revisar_verificacion(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION diime_private.empresa_revisar_verificacion(uuid,text,text,uuid) TO authenticated;
CREATE FUNCTION public.empresa_revisar_verificacion(p_empresa_id uuid,p_decision text,p_nota text,p_verificacion_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT diime_private.empresa_revisar_verificacion(p_empresa_id,p_decision,p_nota,p_verificacion_id);
$$;
REVOKE ALL ON FUNCTION public.empresa_revisar_verificacion(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.empresa_revisar_verificacion(uuid,text,text,uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
