begin;

-- Correcting a CIF must not silently reuse an economic identity already linked
-- in Stripe. Keep existing accounts and historical contract destinations intact.
alter table public.empresas add column identidad_cobros_pendiente boolean not null default false;
alter table public.empresas add column cif_cobros_anterior text;

create function diime_private.empresa_cif_requiere_conciliacion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if upper(regexp_replace(new.cif,'[[:space:]-]','','g')) is distinct from upper(regexp_replace(old.cif,'[[:space:]-]','','g'))
  and exists(select 1 from public.empresa_cuentas_stripe where empresa_id=new.id) then
  new.identidad_cobros_pendiente:=true;
  new.cif_cobros_anterior:=case when old.identidad_cobros_pendiente then old.cif_cobros_anterior else old.cif end;
 end if;
 return new;
end; $$;
revoke all on function diime_private.empresa_cif_requiere_conciliacion() from public,anon,authenticated,service_role;
create trigger empresa_cif_requiere_conciliacion before update of cif on public.empresas
 for each row execute function diime_private.empresa_cif_requiere_conciliacion();

-- Preserve the existing review signature, its authorization, immutable dossier
-- check and self-review guard. Old admin clients cannot bypass reconciliation.
do $migration$
declare definition text:=pg_get_functiondef('diime_private.empresa_revisar_verificacion(uuid,text,text,uuid)'::regprocedure);
 needle text:='perform 1 from public.empresas where id=p_empresa_id for update;';
begin
 if position(needle in definition)=0 then raise exception 'Expected company verification lock'; end if;
 execute replace(definition,needle,needle || E'\n  if p_decision=''verificada'' and exists(select 1 from public.empresas where id=p_empresa_id and identidad_cobros_pendiente) then raise exception ''Comprueba la identidad de la cuenta de cobros antes de verificar la empresa.'' using errcode=''55000''; end if;');
end;
$migration$;

create function diime_private.empresa_revisar_verificacion_con_cobros(
 p_empresa_id uuid,p_verificacion_id uuid,p_cif text,p_cuenta_stripe text,p_confirmacion boolean,p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare e public.empresas; cuenta text;
begin
 if not diime_private.empresa_admin_plataforma() then raise exception 'Solo el equipo de Diime puede comprobar la identidad de cobros.' using errcode='42501'; end if;
 if p_confirmacion is distinct from true or length(btrim(coalesce(p_nota,''))) not between 20 and 2000 then
  raise exception 'Confirma la comprobación de la cuenta e indica las evidencias revisadas (20–2.000 caracteres).' using errcode='22023'; end if;
 select * into e from public.empresas where id=p_empresa_id for update;
 if e.id is null or not e.identidad_cobros_pendiente then raise exception 'No hay una comprobación de cobros pendiente para esta empresa.' using errcode='55000'; end if;
 if e.cif is distinct from p_cif then raise exception 'El CIF ha cambiado. Recarga y revisa la identidad actual.' using errcode='40001'; end if;
 select stripe_account_id into cuenta from public.empresa_cuentas_stripe where empresa_id=e.id for share;
 if cuenta is null or cuenta is distinct from p_cuenta_stripe then raise exception 'La cuenta de cobros ha cambiado. Recarga antes de revisar.' using errcode='40001'; end if;
 if exists(select 1 from public.empresa_miembros where empresa_id=e.id and usuario_id=auth.uid()) then
  raise exception 'No puedes comprobar la identidad de cobros de tu propia empresa.' using errcode='42501'; end if;
 -- Clearing and approving are one transaction. A stale dossier, lost admin
 -- authority or self-review rejection rolls back the entire reconciliation.
 update public.empresas set identidad_cobros_pendiente=false where id=e.id;
 perform diime_private.empresa_revisar_verificacion(e.id,'verificada',p_nota,p_verificacion_id);
 perform diime_private.empresa_registrar_actividad(e.id,'Identidad de cobros comprobada','verificacion',p_verificacion_id,
  jsonb_build_object('cif_anterior',e.cif_cobros_anterior,'cif_actual',e.cif,'cuenta_stripe',cuenta,'comprobaciones',btrim(p_nota)));
end; $$;
create function public.empresa_revisar_verificacion_con_cobros(
 p_empresa_id uuid,p_verificacion_id uuid,p_cif text,p_cuenta_stripe text,p_confirmacion boolean,p_nota text)
returns void language sql security invoker set search_path='' as $$
 select diime_private.empresa_revisar_verificacion_con_cobros(p_empresa_id,p_verificacion_id,p_cif,p_cuenta_stripe,p_confirmacion,p_nota);
$$;
revoke all on function public.empresa_revisar_verificacion_con_cobros(uuid,uuid,text,text,boolean,text),
 diime_private.empresa_revisar_verificacion_con_cobros(uuid,uuid,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.empresa_revisar_verificacion_con_cobros(uuid,uuid,text,text,boolean,text),
 diime_private.empresa_revisar_verificacion_con_cobros(uuid,uuid,text,text,boolean,text) to authenticated;

-- Only the Diime review console receives connected-account identifiers.
create or replace function diime_private.empresa_verificaciones_listar()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not diime_private.empresa_admin_plataforma() then raise exception 'No tienes permiso para revisar empresas' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.creada_at desc) from (
  select distinct on(e.id) e.id empresa_id,e.razon_social empresa_nombre,e.cif,v.id,v.estado,v.metodo,v.representante_nombre,v.cargo_legal,
   v.responsable_usuario_id,v.documento_nombre,v.nota_revision,v.creada_at,v.revisada_at,
   e.identidad_cobros_pendiente,e.cif_cobros_anterior,c.stripe_account_id
  from public.empresas e join diime_private.empresa_verificaciones v on v.empresa_id=e.id
  left join public.empresa_cuentas_stripe c on c.empresa_id=e.id order by e.id,v.creada_at desc
 ) v),'[]');
end; $$;
notify pgrst,'reload schema';
commit;
