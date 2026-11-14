begin;

alter table public.empresas add column domicilio_comprobado_en timestamptz;
alter table public.empresas add column domicilio_cartociudad_id text;

-- This RPC is server-only: the server validates the user's session and a signed
-- CartoCiudad proof before calling it. Permissions are checked again under lock.
create function diime_private.empresa_guardar_datos_legales(
  p_empresa_id uuid,p_actor_id uuid,p_razon_social text,p_cif text,p_domicilio text,p_anteriores jsonb,p_direccion jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare e public.empresas; m public.empresa_miembros; identidad boolean; direccion boolean;
begin
  select * into e from public.empresas where id=p_empresa_id for update;
  select * into m from public.empresa_miembros where empresa_id=p_empresa_id and usuario_id=p_actor_id for share;
  if e.id is null or m.usuario_id is null or not diime_private.es_miembro_empresa(p_empresa_id,p_actor_id)
    or not (m.rol='principal' or coalesce((m.permisos->>'perfil')::boolean,false)) then
    raise exception 'No tienes permiso para editar los datos de la empresa.' using errcode='42501';
  end if;
  p_razon_social:=btrim(p_razon_social); p_cif:=upper(btrim(p_cif)); p_domicilio:=nullif(btrim(p_domicilio),'');
  if p_razon_social is null or length(p_razon_social) not between 2 and 160 or p_razon_social ~ '[[:cntrl:]]'
    or p_cif is null or p_cif !~ '^[A-Z][0-9]{7}[A-Z0-9]$' or length(coalesce(p_domicilio,''))>500 or translate(coalesce(p_domicilio,''),E'\n\r','') ~ '[[:cntrl:]]' then
    raise exception 'Revisa la razón social, el formato del CIF y el domicilio.' using errcode='22023';
  end if;
  if p_anteriores is null or p_anteriores->>'razonSocial' is distinct from e.razon_social
    or p_anteriores->>'cif' is distinct from e.cif or p_anteriores->>'domicilio' is distinct from coalesce(e.domicilio,'') then
    raise exception 'Los datos han cambiado. Recarga la página antes de guardar.' using errcode='40001';
  end if;
  identidad:=p_razon_social is distinct from e.razon_social or p_cif is distinct from e.cif;
  direccion:=p_domicilio is distinct from e.domicilio;
  if identidad and m.rol<>'principal' then raise exception 'Solo el responsable principal puede modificar la razón social o el CIF.' using errcode='42501'; end if;
  if p_direccion is not null and (jsonb_typeof(p_direccion)<>'object' or p_direccion->>'domicilio' is distinct from p_domicilio
    or nullif(p_direccion->>'id','') is null or nullif(p_direccion->>'comprobadoEn','') is null) then
    raise exception 'La comprobación de dirección no corresponde al domicilio.' using errcode='22023';
  end if;
  if direccion and p_domicilio is not null and p_direccion is null then
    raise exception 'Busca y selecciona la dirección antes de guardar.' using errcode='22023';
  end if;
  if p_cif is distinct from e.cif and exists(select 1 from public.empresas otra where otra.id<>e.id and upper(regexp_replace(otra.cif,'[[:space:]-]','','g'))=p_cif) then
    raise exception 'Este CIF ya está asociado a otra empresa.' using errcode='23505';
  end if;
  update public.empresas set razon_social=p_razon_social,cif=p_cif,domicilio=p_domicilio,
    domicilio_comprobado_en=case when p_direccion is not null then (p_direccion->>'comprobadoEn')::timestamptz when direccion then null else domicilio_comprobado_en end,
    domicilio_cartociudad_id=case when p_direccion is not null then p_direccion->>'id' when direccion then null else domicilio_cartociudad_id end,
    estado_verificacion=case when identidad then 'requiere_informacion' else estado_verificacion end,
    verificada=case when identidad then false else verificada end,updated_at=now()
    where id=e.id;
  if identidad then
    -- Close pending dossiers so an old admin screen cannot approve the
    -- new identity using documents submitted for the previous one.
    update diime_private.empresa_verificaciones set estado='requiere_informacion',
      nota_revision='La identidad de la empresa ha cambiado. Presenta documentación actualizada.',revisada_at=now()
      where empresa_id=e.id and estado='en_revision';
  end if;
  perform set_config('diime.actor_usuario_id',p_actor_id::text,true);
  perform diime_private.empresa_registrar_actividad(e.id,case when identidad then 'Identidad legal actualizada; requiere nueva verificación' else 'Domicilio actualizado' end,'empresa',e.id,
    jsonb_build_object('identidad_modificada',identidad,'direccion_comprobada',p_direccion is not null,
      'razon_social',jsonb_build_object('antes',e.razon_social,'despues',p_razon_social),
      'cif',jsonb_build_object('antes',e.cif,'despues',p_cif)));
  -- Existing contracts and trabajos_facturacion snapshots are deliberately untouched.
end; $$;
revoke all on function diime_private.empresa_guardar_datos_legales(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function diime_private.empresa_guardar_datos_legales(uuid,uuid,text,text,text,jsonb,jsonb) to service_role;
create function public.empresa_guardar_datos_legales(p_empresa_id uuid,p_actor_id uuid,p_razon_social text,p_cif text,p_domicilio text,p_anteriores jsonb,p_direccion jsonb)
returns void language sql security invoker set search_path='' as $$
  select diime_private.empresa_guardar_datos_legales(p_empresa_id,p_actor_id,p_razon_social,p_cif,p_domicilio,p_anteriores,p_direccion);
$$;
revoke all on function public.empresa_guardar_datos_legales(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.empresa_guardar_datos_legales(uuid,uuid,text,text,text,jsonb,jsonb) to service_role;

-- Prevent older profile editors from bypassing the checked address workflow.
do $migration$
declare definition text:=pg_get_functiondef('diime_private.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean)'::regprocedure);
  needle text:='empresa:=diime_private.empresa_exigir_permiso(''perfil'');';
  address_write text:=$assignment$domicilio=case when p_datos_profesionales?'domicilio' then nullif(btrim(p_datos_profesionales->>'domicilio'),'') else domicilio end,$assignment$;
begin
  if position(needle in definition)=0 or position(address_write in definition)=0 then
    raise exception 'Expected profile permission check and legacy address assignment';
  end if;
  -- Equality is only a compatibility check. This RPC must never write the
  -- address: a checked save can commit after the read but before its UPDATE.
  -- Removing the assignment prevents stale values inheriting newer proof data.
  definition:=replace(definition,address_write,'');
  execute replace(definition,needle,needle || E'\n  if p_datos_profesionales?''domicilio'' and nullif(btrim(p_datos_profesionales->>''domicilio''),'''') is distinct from (select domicilio from public.empresas where id=empresa) then raise exception ''Edita y comprueba el domicilio desde Datos legales.'' using errcode=''22023''; end if;');
end;
$migration$;

do $migration$
declare definition text:=pg_get_functiondef('diime_private.empresa_workspace()'::regprocedure);
  needle text:='''domicilio'',e.domicilio,';
begin
  if position(needle in definition)=0 then raise exception 'Expected workspace address projection'; end if;
  execute replace(definition,needle,needle || '''domicilio_comprobado_en'',e.domicilio_comprobado_en,');
end;
$migration$;
notify pgrst,'reload schema';
commit;
