-- Evaluate the existing authorization predicate only for the opposite party.
-- Preserve the live function body, including attachment validation, locks and ACL.
begin;
do $migration$
declare
  definition text := pg_get_functiondef('diime_private.empresa_mensaje_enviar(uuid,text,text,text,text)'::regprocedure);
  old_fragment text := $old$
 insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
 select p.id,'mensaje','Nuevo mensaje de empresa','Tienes un mensaje nuevo en una conversación de empresa.','/mensajes?c='||c.id::text,false,jsonb_build_object('conversacion_id',c.id,'empresa_id',coalesce(c.empresa_2_id,c.empresa_1_id))
 from public.profiles p where p.id<>auth.uid() and
 case when lado_uno then diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,p.id)
 else diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,p.id) end;
$old$;
  new_fragment text := $new$
 with destinatarios as materialized (
   select p.id from public.profiles p
   where (case when lado_uno then c.empresa_2_id else c.empresa_1_id end) is null
     and p.id=case when lado_uno then c.participante_2 else c.participante_1 end
   union
   select m.usuario_id from public.empresa_miembros m
   join public.profiles p on p.id=m.usuario_id
   where m.empresa_id=case when lado_uno then c.empresa_2_id else c.empresa_1_id end
 )
 insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
 select d.id,'mensaje','Nuevo mensaje de empresa','Tienes un mensaje nuevo en una conversación de empresa.','/mensajes?c='||c.id::text,false,jsonb_build_object('conversacion_id',c.id,'empresa_id',coalesce(c.empresa_2_id,c.empresa_1_id))
 from destinatarios d where d.id<>auth.uid() and
 case when lado_uno then diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,d.id)
 else diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,d.id) end;
$new$;
begin
  if (length(definition)-length(replace(definition,old_fragment,''))) <> length(old_fragment) then
    raise exception 'Expected exactly one original company-message notification query';
  end if;
  execute replace(definition,old_fragment,new_fragment);
end;
$migration$;
commit;
