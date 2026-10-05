/** PostgreSQL real (PGlite), datos sintéticos y permisos auth/anon/service_role.
 * npm install --prefix /tmp/diime-empresa-db-tests --no-save --no-package-lock @electric-sql/pglite@0.3.14
 * PGLITE_PATH=/tmp/diime-empresa-db-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/empresas-equipo.test.mjs
 * La fixture conserva columnas y funciones relevantes del esquema vigente;
 * no sustituye un reset integral de Supabase ni una prueba Stripe end-to-end.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : '@electric-sql/pglite')
process.on('uncaughtException',e=>{console.error({message:e.message,code:e.code,where:e.where,position:e.position,detail:e.detail,stack:e.stack?.split('\n').slice(0,3).join('\n')});process.exit(1)})
const db = new PGlite()
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8')
let assertions = 0
const check = (condition, message) => { assert.ok(condition, message); assertions++ }
const one = async (sql, args = []) => (await db.query(sql,args)).rows[0]
const rpc = async (name, args = []) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).value
const asRole = async (role='postgres', actor=null) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('diime.actor_usuario_id','',false)",[actor || ''])
  if (role !== 'postgres') await db.exec(`set role ${role}`)
}
const expectError = async (fn, pattern, message) => {
  try { await fn() } catch (error) { assert.match(error.message,pattern,message); assertions++; return }
  assert.fail(message || `Expected error ${pattern}`)
}
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema private; create schema diime_private;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public,private,diime_private to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
`)
await db.exec(await read('./fixtures/empresas-baseline.sql'))
await db.exec(`
 grant all on all tables in schema public to service_role;
 grant select,insert,update,delete on public.profiles,public.profesionales,public.empresas,public.solicitudes,public.ofertas,public.trabajos to authenticated;
 grant select on public.solicitudes to anon;
 alter table public.solicitudes enable row level security;
 alter table public.ofertas enable row level security;
 alter table public.trabajos enable row level security;
 create policy solicitudes_select on public.solicitudes for select using(true);
 create policy solicitudes_insert on public.solicitudes for insert to authenticated with check(cliente_id=auth.uid());
 create policy solicitudes_update on public.solicitudes for update to authenticated using(cliente_id=auth.uid()) with check(cliente_id=auth.uid());
 create policy solicitudes_delete on public.solicitudes for delete to authenticated using(cliente_id=auth.uid());
 create policy ofertas_select on public.ofertas for select to authenticated using(profesional_id=auth.uid() or exists(select 1 from public.solicitudes s where s.id=solicitud_id and s.cliente_id=auth.uid()));
 create policy ofertas_insert on public.ofertas for insert to authenticated with check(profesional_id=auth.uid());
 create policy ofertas_update on public.ofertas for update to authenticated using(profesional_id=auth.uid() or exists(select 1 from public.solicitudes s where s.id=solicitud_id and s.cliente_id=auth.uid()));
 create policy ofertas_delete on public.ofertas for delete to authenticated using(profesional_id=auth.uid());
 create policy trabajos_select on public.trabajos for select to authenticated using(auth.uid() in (cliente_id,profesional_id));
 create policy trabajos_update on public.trabajos for update to authenticated using(auth.uid() in (cliente_id,profesional_id));
`)
await db.exec(await read('./fixtures/empresas-workflow-baseline.sql'))
await db.exec(await read('./fixtures/empresas-financial-baseline.sql'))
await db.exec(`
 grant execute on function public.vincular_mi_empresa(text,text,text,text,text,text,text) to authenticated;
 grant execute on function diime_private.vincular_empresa(text,text,text,text,text,text,text) to authenticated;
 create trigger trg_guardar_integridad_solicitud before insert or update or delete on public.solicitudes for each row execute function public.guardar_integridad_solicitud();
 create trigger trg_guardar_integridad_oferta before insert or update or delete on public.ofertas for each row execute function public.guardar_integridad_oferta();
 create trigger trg_guardar_integridad_trabajo before insert or update or delete on public.trabajos for each row execute function public.guardar_integridad_trabajo();
 create trigger trg_validar_nuevo_contrato before insert on public.trabajos for each row execute function public.validar_nuevo_contrato();
 create trigger trg_proteger_pertenencia_empresa before insert or update of empresa_id on public.profiles for each row execute function public.proteger_pertenencia_empresa();
`)
const ids = {owner:'00000000-0000-4000-8000-000000000001',member:'00000000-0000-4000-8000-000000000002',client:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004',clientOnly:'00000000-0000-4000-8000-000000000005'}
for (const [name,id] of Object.entries(ids)) {
 await db.query("insert into auth.users values($1,$2,now())",[id,`${name}@example.test`])
 await db.query("insert into public.profiles(id,email,nombre,bio,verificado) values($1,$2,$3,'Resumen profesional de prueba',true)",[id,`${name}@example.test`,name])
 if(name!=='clientOnly') await db.query("insert into public.profesionales(id,titulo,stripe_account_id,stripe_onboarding_completado,stripe_transferencias_habilitadas,stripe_payouts_habilitados) values($1,'Profesional de prueba',$2,true,true,true)",[id,`acct_${name}`])
}
// Historical rows intentionally predate identity columns.
const legacyRequest=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Histórico personal','Prueba','Madrid') returning id",[ids.owner])).id
const legacyCompany=(await one("insert into public.empresas(nombre,cif,propietario_id,token_invitacion) values('Legado','B00000000',$1,'token-antiguo') returning id",[ids.owner])).id
await db.query('update public.profiles set empresa_id=$1 where id=$2',[legacyCompany,ids.owner])
const legacyOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,2,'Oferta histórica',5,0,5,95) returning id",[legacyRequest,ids.client])).id
ids.legacyJob=(await one("insert into public.trabajos(cliente_id,profesional_id,solicitud_id,oferta_id,titulo,precio_acordado,estado) values($1,$2,$3,$4,'Histórico',100,'pendiente_pago') returning id",[ids.owner,ids.client,legacyRequest,legacyOffer])).id
await db.exec(await read('../migrations/20260921221953_empresas_equipo_identidad_auditoria.sql'))
await db.exec(await read('../migrations/20260921222030_empresa_liquidacion_destino.sql'))
await db.exec(await read('../migrations/20260921223402_empresa_facturacion_snapshot.sql'))
ids.company=legacyCompany
check((await one('select empresa_id from public.solicitudes where id=$1',[legacyRequest])).empresa_id===null,'Histórico no reatribuido')
check((await one('select token_invitacion from public.empresas where id=$1',[ids.company])).token_invitacion===null,'Token compartido cerrado')
check((await one('select count(*)::int count from public.empresa_miembros where empresa_id=$1 and usuario_id=$2',[ids.company,ids.owner])).count===1,'Titular auto miembro')
await asRole('authenticated',ids.owner)
check((await rpc('empresa_contexto_actual')).id===ids.company,'Contexto titular')
await expectError(()=>rpc('vincular_mi_empresa',['token-antiguo',null,null,'DOC',null,null,null]),/enlace personal/,'Token legacy no vincula')
await rpc('empresa_actualizar_miembro',[ids.owner,'Director general',false])
await rpc('empresa_editar_perfil',['Empresa prueba','Descripción','Madrid','https://example.test',null,['Reformas']])
const invitation=await rpc('empresa_crear_invitacion',['member@example.test','Arquitecto'])
check(invitation.token.length===64,'Invitación fuerte e individual')
await asRole('authenticated',ids.outsider)
check((await rpc('empresa_consultar_invitacion',[invitation.token])).coincide_email===false,'Consulta detecta correo incorrecto')
await expectError(()=>rpc('empresa_aceptar_invitacion',[invitation.token]),/correo verificado/,'Correo ajeno no acepta')
await asRole('authenticated',ids.member)
check(await rpc('empresa_aceptar_invitacion',[invitation.token])===ids.company,'Aceptación por profesional invitado')
check((await one('select empresa_id,verificado from public.profiles where id=$1',[ids.member])).empresa_id===null,'Membresía no cambia identidad fiscal personal')
check((await one('select stripe_account_id from public.profesionales where id=$1',[ids.member])).stripe_account_id==='acct_member','Connect personal conservado')
check((await one('select verificado from public.profiles where id=$1',[ids.member])).verificado===true,'Verificación personal conservada')
await expectError(()=>rpc('empresa_aceptar_invitacion',[invitation.token]),/ya se ha utilizado/,'Token un uso')
await expectError(()=>rpc('empresa_crear_invitacion',['outsider@example.test','Ayudante']),/Solo el titular/,'Miembro no invita')
await expectError(()=>rpc('empresa_actualizar_miembro',[ids.owner,'Intruso',true]),/Solo el titular/,'Miembro no revoca')
await expectError(()=>rpc('empresa_editar_perfil',['Hack',null,null,null,null,[]]),/Solo el titular/,'Miembro no edita empresa')
await expectError(()=>db.query("update public.empresas set verificada=true where id=$1",[ids.company]),/permission denied/,'RPC estrecha impide auto verificar')
await expectError(()=>db.query('select token_hash from public.empresa_invitaciones'),/permission denied/,'Hash invitación privado')
await asRole('authenticated',ids.owner)
const clientInvite=await rpc('empresa_crear_invitacion',['clientOnly@example.test','Técnico'])
await asRole('authenticated',ids.clientOnly)
await expectError(()=>rpc('empresa_aceptar_invitacion',[clientInvite.token]),/perfil profesional/,'Un cliente no aparece como profesional inexistente')
await asRole('authenticated',ids.owner)
const revokedInvite=await rpc('empresa_crear_invitacion',['outsider@example.test','Técnico'])
await rpc('empresa_revocar_invitacion',[revokedInvite.id])
await asRole('authenticated',ids.outsider)
await expectError(()=>rpc('empresa_aceptar_invitacion',[revokedInvite.token]),/caducado o ya/,'Invitación revocada denegada')
await asRole('authenticated',ids.owner)
const expiredInvite=await rpc('empresa_crear_invitacion',['outsider@example.test','Técnico'])
await asRole()
await db.query("update public.empresa_invitaciones set expira_at=now()-interval '1 second' where id=$1",[expiredInvite.id])
await asRole('authenticated',ids.outsider)
await expectError(()=>rpc('empresa_aceptar_invitacion',[expiredInvite.token]),/caducado/,'Invitación caducada denegada')
// An ordinary client requests work; invited professional bids as company.
await asRole('authenticated',ids.client)
ids.request=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion,actor_usuario_id) values($1,'Reforma de cocina','Solicitud de prueba','Madrid',$2) returning id,actor_usuario_id",[ids.client,ids.owner])).id
check((await one('select actor_usuario_id from public.solicitudes where id=$1',[ids.request])).actor_usuario_id===ids.client,'Actor falseado reemplazado por sesión')
await asRole('authenticated',ids.member)
ids.offer=(await one("insert into public.ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,100,2,'Oferta empresa',5,0,5,95) returning id",[ids.request,ids.member,ids.company])).id
await expectError(()=>db.query('update public.ofertas set empresa_id=null where id=$1',[ids.offer]),/inmutables/,'No cambiar identidad oferta')
await expectError(()=>db.query('update public.ofertas set actor_usuario_id=$1 where id=$2',[ids.owner,ids.offer]),/inmutables/,'No cambiar autor oferta')
await asRole('authenticated',ids.client)
const contract=(await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',[ids.offer,ids.request,ids.member])).value.trabajo
ids.job=contract.id
check(contract.empresa_proveedora_id===ids.company && contract.empresa_cliente_id===null,'Contrato copia contexto ofertas/solicitudes')
check(contract.actor_contratacion_id===ids.client && contract.profesional_id===ids.member,'Contrato conserva autor humano')
check(contract.proveedor_cobros_usuario_id===ids.owner && contract.proveedor_stripe_account_id==='acct_owner','Cobro empresa pertenece titular')
await asRole('authenticated',ids.owner)
const ownRequest=(await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Obra empresa','Solicitud empresa','Madrid') returning id",[ids.owner,ids.company])).id
await asRole('authenticated',ids.member)
await expectError(()=>db.query("insert into public.ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion) values($1,$2,$3,100,2,'Autopuja')",[ownRequest,ids.member,ids.company]),/propia empresa/,'No auto puja empresa')
await expectError(()=>db.query("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion) values($1,$2,100,2,'Autopuja personal')",[ownRequest,ids.member]),/propia empresa/,'No eludir autopuja cambiando contexto personal')
await asRole('authenticated',ids.outsider)
await expectError(()=>db.query("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Falsificación','No permitida','Madrid')",[ids.outsider,ids.company]),/equipo activo/,'No usar empresa ajena')
// The same invited professional can hire for the company on a request they authored.
await asRole('authenticated',ids.member)
ids.companyRequest=(await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Contratación empresarial','Trabajo encargado','Madrid') returning id",[ids.member,ids.company])).id
await asRole('authenticated',ids.outsider)
ids.incomingOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,2,'Proveedor externo',5,0,5,95) returning id",[ids.companyRequest,ids.outsider])).id
await asRole('authenticated',ids.member)
const hired=(await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',[ids.incomingOffer,ids.companyRequest,ids.outsider])).value.trabajo
ids.companyClientJob=hired.id
check(hired.empresa_cliente_id===ids.company && hired.empresa_proveedora_id===null && hired.actor_contratacion_id===ids.member,'Miembro contrata con identidad empresa y autor individual')
check(hired.proveedor_cobros_usuario_id===ids.outsider && hired.proveedor_stripe_account_id==='acct_outsider','Contratar por empresa no redirige cobro del proveedor independiente')
// Portfolio/reviews belong to the company on the contract, never membership now.
await asRole()
await db.query("insert into public.portfolio(profesional_id,trabajo_id,titulo,presupuesto) values($1,$2,'Proyecto empresa',1234.56)",[ids.member,ids.job])
await db.query("insert into public.portfolio(profesional_id,titulo,presupuesto) values($1,'Proyecto personal',999.99)",[ids.member])
await db.query('insert into public."reseñas"(trabajo_id,autor_id,profesional_id,rating,comentario) values($1,$2,$3,5,\'Buen trabajo\'),($1,$3,$2,1,\'Al cliente\')',[ids.job,ids.client,ids.member])
await asRole('anon')
const publicProfile=await rpc('empresa_perfil_publico',[ids.company])
check(publicProfile.miembros.length===2 && publicProfile.miembros.some(m=>m.cargo==='Arquitecto'),'Equipo público con cargo/resumen')
check(!/token|cif|@example|documento|stripe|1234\.56/.test(JSON.stringify(publicProfile)),'Proyección pública no filtra datos sensibles ni precio exacto')
check(publicProfile.portfolio.length===1 && publicProfile.resenas.length===1,'Sólo portfolio y reseñas de contratos empresa')
await expectError(()=>rpc('empresa_workspace'),/permission denied/,'Anon no ve workspace')
await expectError(()=>rpc('empresa_crear_invitacion',['x@example.test','Cargo']),/permission denied/,'Anon no invita')
await expectError(()=>rpc('diime_confirmar_pago',[ids.job,'fake','fake','fake',1,'eur']),/permission denied/,'Anon no invoca confirmación de pagos interna')
const companies=await rpc('empresas_publicas')
const affiliation=await rpc('empresa_afiliacion_publica',[ids.member])
await asRole('authenticated',ids.owner)
const workspace=await rpc('empresa_workspace')
const inviteView=await rpc('empresa_consultar_invitacion',[expiredInvite.token])
await writeFile('/tmp/diime-empresa-rpc-fixtures.json',JSON.stringify({empresa_perfil_publico:publicProfile,empresa_workspace:workspace,empresas_publicas:companies,empresa_consultar_invitacion:inviteView,empresa_afiliacion_publica:affiliation},null,2))
check(workspace.actividad.some(a=>a.actor_usuario_id===ids.member && a.entidad_id===ids.offer && a.detalle.titulo_objeto==='Reforma de cocina'),'Auditoría oferta con actor y objeto')
await expectError(()=>rpc('diime_bloquear_checkout',[ids.job,ids.client,true,false]),/permission denied/,'Authenticated no invoca RPC financiera service-only')
await rpc('empresa_actualizar_miembro',[ids.member,null,true])
await asRole('authenticated',ids.member)
check(await rpc('empresa_contexto_actual')===null,'Baja revoca contexto inmediatamente')
check(await rpc('empresa_workspace')===null,'Baja revoca workspace')
await expectError(()=>db.query("update public.ofertas set estado='rechazada' where id=$1",[ids.incomingOffer]),/baja de la empresa/,'Exmiembro no rechaza ofertas recibidas por empresa')
await expectError(()=>db.query("insert into public.ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion) values($1,$2,$3,100,2,'Tras baja')",[ids.request,ids.member,ids.company]),/equipo activo/,'Baja impide pujar')
check((await db.query("update public.trabajos set notas_privadas_proveedor='No' where id=$1 returning id",[ids.job])).rows.length===0,'RLS impide mutar contrato de exmiembro')
await asRole('service_role')
await expectError(()=>rpc('diime_bloquear_checkout',[ids.job,ids.member,true,false]),/baja de la empresa/,'RPC financiera service revalida actor')
check((await one('select empresa_proveedora_id,profesional_id,proveedor_cobros_usuario_id from public.trabajos where id=$1',[ids.job])).proveedor_cobros_usuario_id===ids.owner,'Baja no redirige cobros ni destruye identidad histórica')
await asRole()
const escrow=(await one("insert into public.transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,comision_proveedor_original) values($1,$2,$3,105,5) returning id",[ids.job,ids.client,ids.member])).id
await asRole('service_role')
const paid=await rpc('diime_confirmar_pago',[escrow,'cs_test','pi_test','ch_test',10500,'eur'])
check(paid.tardio===true && paid.activado===false && paid.escrow.estado==='pago_tardio','Checkout pagado tras baja no reactiva contrato')
await asRole('authenticated',ids.owner)
const audit=await rpc('empresa_workspace')
check(audit.actividad.some(a=>a.actor_usuario_id===ids.member && a.entidad_id===ids.offer),'Auditoría humana persiste tras baja')
check((await rpc('empresa_perfil_publico',[ids.company])).miembros.length===1,'Baja elimina miembro del perfil público')
await expectError(()=>rpc('empresa_actualizar_miembro',[ids.owner,null,true]),/titular no puede/,'Titular no puede darse de baja')
await asRole('authenticated',ids.outsider)
const newCompany=await rpc('vincular_mi_empresa',[null,'Segunda empresa','B11111111','DOC-TEST','Gerente',null,'Madrid'])
check((await rpc('empresa_contexto_actual')).id===newCompany,'Crear empresa da membresía automática a su titular')
await asRole()
const newTables=await db.query("select relname,relrowsecurity from pg_class where relname in ('empresa_miembros','empresa_invitaciones','empresa_actividad')")
check(newTables.rows.every(t=>t.relrowsecurity),'RLS enabled en todas las tablas nuevas')
// Closing the owner also closes all invitations and effective memberships.
await asRole('authenticated',ids.outsider)
const closedInvite=await rpc('empresa_crear_invitacion',['client@example.test','Gestor'])
await asRole()
await db.query('update public.profiles set cuenta_eliminada=now() where id=$1',[ids.outsider])
await asRole('authenticated',ids.client)
await expectError(()=>rpc('empresa_aceptar_invitacion',[closedInvite.token]),/ya no está disponible/,'Empresa de titular dado de baja no acepta invitaciones')
await asRole('authenticated',ids.outsider)
check(await rpc('empresa_contexto_actual')===null,'Titular dado de baja pierde contexto empresa')
await asRole()
await db.query('update public.profiles set cuenta_eliminada=null where id=$1',[ids.outsider])
const exposed=await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'empresa%' and p.prosecdef")
check(exposed.rows.length===0,'Endpoints públicos no son SECURITY DEFINER')
const { testCobros } = await import('./empresas-cobros-scenarios.mjs')
await testCobros({db,asRole,ids,expectError,one,rpc,check})
console.log(`OK ${assertions} comprobaciones PostgreSQL empresas: invitación, permisos, identidad, autoría, privacidad, baja y pago tardío.`)
await db.close()
