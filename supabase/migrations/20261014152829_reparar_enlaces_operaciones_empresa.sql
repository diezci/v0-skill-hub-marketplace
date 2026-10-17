-- New notices open the company operation. Historical links are handled by the app redirect.
create or replace function diime_private.proteger_destinatario_aviso_empresa()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  t public.trabajos; parte text; empresa uuid; operador uuid; destino uuid;
  permiso text; financiera boolean; indicada text;
begin
  if coalesce(new.metadata->>'trabajo_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  select * into t from public.trabajos where id=(new.metadata->>'trabajo_id')::uuid;
  if not found or (t.empresa_cliente_id is null and t.empresa_proveedora_id is null) then return new; end if;
  indicada:=new.metadata->>'parte_destinataria';
  if indicada in('cliente','proveedor') then
    empresa:=case when indicada='cliente' then t.empresa_cliente_id else t.empresa_proveedora_id end;
    if new.usuario_id in(case when indicada='cliente' then t.cliente_id else t.profesional_id end,
      case when indicada='cliente' then t.operador_cliente_id else t.operador_proveedor_id end)
      or exists(select 1 from public.empresa_miembros m where m.empresa_id=empresa and m.usuario_id=new.usuario_id) then parte:=indicada; end if;
  elsif new.usuario_id in(t.cliente_id,t.operador_cliente_id) and new.usuario_id not in(t.profesional_id,coalesce(t.operador_proveedor_id,t.profesional_id)) then parte:='cliente';
  elsif new.usuario_id in(t.profesional_id,t.operador_proveedor_id) and new.usuario_id not in(t.cliente_id,coalesce(t.operador_cliente_id,t.cliente_id)) then parte:='proveedor';
  end if;
  -- Platform admin notices and unrelated/personal destinations are untouched.
  if parte is null then return new; end if;
  empresa:=case when parte='cliente' then t.empresa_cliente_id else t.empresa_proveedora_id end;
  if empresa is null then return new; end if;
  operador:=case when parte='cliente' then coalesce(t.operador_cliente_id,t.cliente_id) else coalesce(t.operador_proveedor_id,t.profesional_id) end;
  financiera:=new.tipo in('pago_liberado','reembolso_emitido','reembolso_fallido','disputa_ganada','disputa_perdida','disputa_resuelta');
  permiso:=case when financiera then 'ver_cobros' else 'encargos' end;
  select m.usuario_id into destino from public.empresa_miembros m
    where m.empresa_id=empresa and diime_private.es_miembro_empresa(empresa,m.usuario_id)
      and (m.usuario_id=operador or m.rol in('principal','administrador'))
      and (diime_private.empresa_tiene_permiso(empresa,m.usuario_id,permiso)
        or (not financiera and m.rol in('principal','administrador')))
    order by case when m.usuario_id=new.usuario_id and (m.usuario_id=operador or m.rol in('principal','administrador')) then 0
      when m.usuario_id=operador then 1 when m.rol='principal' then 2 else 3 end,m.usuario_id
    limit 1 for share of m;
  if destino is null then return null; end if;
  new.usuario_id:=destino;
  new.link:='/mi-empresa?trabajo='||t.id||'&aspecto='||new.tipo;
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('empresa_id',empresa,'parte_destinataria',parte);
  return new;
end; $$;
notify pgrst,'reload schema';
