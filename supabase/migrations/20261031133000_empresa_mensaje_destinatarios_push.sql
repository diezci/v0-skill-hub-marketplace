-- Return the exact recipients of the notification insert so native delivery
-- uses the same authorization snapshot, locks, filtering and deduplication.
begin;
do $migration$
declare
 definition text := pg_get_functiondef('diime_private.empresa_mensaje_enviar(uuid,text,text,text,text)'::regprocedure);
 old_query text := $old$
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
$old$;
 new_query text := $new$
 with destinatarios as materialized (
   select p.id from public.profiles p
   where (case when lado_uno then c.empresa_2_id else c.empresa_1_id end) is null
     and p.id=case when lado_uno then c.participante_2 else c.participante_1 end
   union
   select m.usuario_id from public.empresa_miembros m
   join public.profiles p on p.id=m.usuario_id
   where m.empresa_id=case when lado_uno then c.empresa_2_id else c.empresa_1_id end
 ), avisos_insertados as (
 insert into public.notificaciones(usuario_id,tipo,titulo,mensaje,link,leida,metadata)
 select d.id,'mensaje','Nuevo mensaje de empresa','Tienes un mensaje nuevo en una conversación de empresa.','/mensajes?c='||c.id::text,false,jsonb_build_object('conversacion_id',c.id,'empresa_id',coalesce(c.empresa_2_id,c.empresa_1_id))
 from destinatarios d where d.id<>auth.uid() and
 case when lado_uno then diime_private.empresa_chat_parte(c.empresa_2_id,c.participante_2,c.responsable_2_id,d.id)
 else diime_private.empresa_chat_parte(c.empresa_1_id,c.participante_1,c.responsable_1_id,d.id) end
 returning usuario_id
 )
 select coalesce(array_agg(usuario_id),array[]::uuid[]) into destinatarios_push from avisos_insertados;
$new$;
 old_return text := $old$return to_jsonb(resultado)||jsonb_build_object('empresa_nombre',(select e.nombre from public.empresas e where e.id=empresa));$old$;
 new_return text := $new$return to_jsonb(resultado)||jsonb_build_object('empresa_nombre',(select e.nombre from public.empresas e where e.id=empresa),'destinatarios_push',to_jsonb(destinatarios_push));$new$;
begin
 -- Permit a local bootstrap to record an already verified direct application.
 -- Fail closed if only part of the reviewed replacement is present.
 if cardinality(string_to_array(definition,new_query))=2
   and cardinality(string_to_array(definition,'lado_uno boolean; destinatarios_push uuid[];'))=2
   and cardinality(string_to_array(definition,new_return))=2 then
   return;
 end if;
 if cardinality(string_to_array(definition,old_query))<>2
   or cardinality(string_to_array(definition,'lado_uno boolean;'))<>2
   or cardinality(string_to_array(definition,old_return))<>2 then
   raise exception 'Expected the reviewed company notification function exactly once';
 end if;
 definition:=replace(definition,'lado_uno boolean;','lado_uno boolean; destinatarios_push uuid[];');
 definition:=replace(definition,old_query,new_query);
 definition:=replace(definition,old_return,new_return);
 execute definition;
end;
$migration$;
commit;
