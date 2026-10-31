begin;
create table if not exists diime_private.plazos_workflow (
 trabajo_id uuid primary key references public.trabajos(id) on delete cascade,
 caducidad_preparada_at timestamptz, caducado_at timestamptz, recordatorio_entrega_at timestamptz
);
alter table diime_private.plazos_workflow enable row level security;
revoke all on diime_private.plazos_workflow from public,anon,authenticated;

create or replace function diime_private.avisar_plazo_workflow(p_trabajo uuid,p_tipo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; destino record; usuario uuid; aviso jsonb; avisos jsonb:='[]'; titulo text; mensaje text; link text;
begin
 select * into t from public.trabajos where id=p_trabajo;
 if p_tipo='contrato_caducado' then
  titulo:='Contrato cancelado por falta de pago';mensaje:='El contrato "'||t.titulo||'" ha caducado tras 15 días sin pago. Sus enlaces de pago están cerrados. Para continuar será necesaria una nueva aceptación.';
 elsif p_tipo='entrega_sin_respuesta' then
  titulo:='Entrega pendiente de revisión desde hace 7 días';mensaje:='La entrega de "'||t.titulo||'" lleva 7 días sin confirmación. Revisa el trabajo o solicita mediación a Diime. Los fondos siguen retenidos: no se liberan automáticamente.';
 else raise exception 'Aviso de plazo no válido'; end if;
 for destino in select * from (values('cliente',t.empresa_cliente_id,coalesce(t.operador_cliente_id,t.cliente_id)),('proveedor',t.empresa_proveedora_id,coalesce(t.operador_proveedor_id,t.profesional_id))) d(parte,empresa,operador) loop
  usuario:=null;
  if diime_private.empresa_puede_operar_trabajo(t.id,destino.operador,'encargos',destino.parte) then usuario:=destino.operador;
  elsif destino.empresa is not null then
   select m.usuario_id into usuario from public.empresa_miembros m join public.profiles p on p.id=m.usuario_id
    where m.empresa_id=destino.empresa and m.estado='activo' and m.rol in('principal','administrador') and p.cuenta_eliminada is null
     and (m.permisos->>'encargos')::boolean order by (m.rol='principal') desc,m.usuario_id limit 1;
  end if;
  if usuario is null then continue; end if;
  link:=case when destino.empresa is not null then '/mi-empresa' when destino.parte='cliente' then '/mis-solicitudes' else '/mis-trabajos' end
    ||'?trabajo='||t.id||'&aspecto='||p_tipo;
  insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
   values(usuario,p_tipo,titulo,mensaje,link,false,jsonb_build_object('trabajo_id',t.id,'solicitud_id',t.solicitud_id,'oferta_id',t.oferta_id,'titulo_trabajo',t.titulo,'parte_destinataria',destino.parte))
   returning to_jsonb(notificaciones) into aviso;
  avisos:=avisos||jsonb_build_array(aviso);
 end loop;
 return avisos;
end; $$;
revoke all on function diime_private.avisar_plazo_workflow(uuid,text) from public,anon,authenticated;

create or replace function diime_private.gestionar_plazo_workflow(p_trabajo uuid,p_accion text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.trabajos; marca diime_private.plazos_workflow; avisos jsonb:='[]';
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Solo el servidor puede procesar plazos' using errcode='42501'; end if;
 perform public.diime_bloquear_trabajo_financiero(p_trabajo);
 select * into t from public.trabajos where id=p_trabajo;
 if t.id is null then return jsonb_build_object('cambio',false,'motivo','no_existe'); end if;
 select * into marca from diime_private.plazos_workflow where trabajo_id=t.id;
 if p_accion in('preparar_caducidad','cerrar_caducidad') then
  if t.estado<>'pendiente_pago' or t.created_at+interval '15 days'>now() or t.cancelacion_estado='pendiente' or t.cancelacion_aceptada_por is not null then
   return jsonb_build_object('cambio',false,'motivo','no_caducable'); end if;
  if exists(select 1 from public.transacciones_escrow e where e.trabajo_id=t.id and
    (e.stripe_charge_id is not null or e.fecha_retencion is not null or e.estado not in('pendiente','cancelado'))) then
   return jsonb_build_object('cambio',false,'motivo','pago_por_conciliar'); end if;
  if p_accion='preparar_caducidad' then
   if t.pago_bloqueado and marca.caducidad_preparada_at is null then return jsonb_build_object('cambio',false,'motivo','otra_revision'); end if;
   insert into diime_private.plazos_workflow(trabajo_id,caducidad_preparada_at) values(t.id,now())
    on conflict(trabajo_id) do update set caducidad_preparada_at=coalesce(plazos_workflow.caducidad_preparada_at,excluded.caducidad_preparada_at);
   update public.trabajos set pago_bloqueado=true where id=t.id;
   return jsonb_build_object('cambio',true,'motivo','cerrar_checkouts');
  end if;
  if marca.caducidad_preparada_at is null or exists(select 1 from public.transacciones_escrow e where e.trabajo_id=t.id and e.estado='pendiente') then
   return jsonb_build_object('cambio',false,'motivo','checkout_sin_cerrar'); end if;
  update public.trabajos set estado='cancelado',fecha_fin=now(),pago_bloqueado=true,updated_at=now() where id=t.id;
  update public.ofertas set estado='retirada',updated_at=now() where id=t.oferta_id;
  update public.solicitudes set estado='abierta',updated_at=now() where id=t.solicitud_id;
  update diime_private.plazos_workflow set caducado_at=now() where trabajo_id=t.id;
  avisos:=diime_private.avisar_plazo_workflow(t.id,'contrato_caducado');
 elsif p_accion='recordar_entrega' then
  if t.estado<>'entregado' or t.fecha_entrega is null or t.fecha_entrega+interval '7 days'>now() or marca.recordatorio_entrega_at is not null then
   return jsonb_build_object('cambio',false,'motivo','sin_recordatorio'); end if;
  insert into diime_private.plazos_workflow(trabajo_id,recordatorio_entrega_at) values(t.id,now())
   on conflict(trabajo_id) do update set recordatorio_entrega_at=excluded.recordatorio_entrega_at;
  avisos:=diime_private.avisar_plazo_workflow(t.id,'entrega_sin_respuesta');
 else raise exception 'Acción de plazo no válida' using errcode='22023'; end if;
 return jsonb_build_object('cambio',true,'avisos',avisos);
end; $$;
create or replace function public.gestionar_plazo_workflow(p_trabajo uuid,p_accion text)
returns jsonb language sql security invoker set search_path='' as $$ select diime_private.gestionar_plazo_workflow(p_trabajo,p_accion); $$;
revoke all on function diime_private.gestionar_plazo_workflow(uuid,text),public.gestionar_plazo_workflow(uuid,text) from public,anon,authenticated;
grant execute on function diime_private.gestionar_plazo_workflow(uuid,text),public.gestionar_plazo_workflow(uuid,text) to service_role;
-- Include the delivery timestamp in the existing authorized workspace projection.
do $$ declare anterior text; posterior text; begin
 anterior:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
 if strpos(anterior,'''fecha_entrega'',t.fecha_entrega')>0 then return; end if;
 posterior:=replace(anterior,'''fecha'',t.created_at,','''fecha'',t.created_at,''fecha_entrega'',t.fecha_entrega,');
 if anterior=posterior then raise exception 'No se encontró la proyección temporal del trabajo'; end if;
 execute posterior;
end $$;
commit;
