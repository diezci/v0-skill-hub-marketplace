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
const ids = {admin:'00000000-0000-4000-8000-000000000006',platformAdmin:'00000000-0000-4000-8000-000000000007',worker2:'00000000-0000-4000-8000-000000000008',owner:'00000000-0000-4000-8000-000000000001',member:'00000000-0000-4000-8000-000000000002',client:'00000000-0000-4000-8000-000000000003',outsider:'00000000-0000-4000-8000-000000000004',clientOnly:'00000000-0000-4000-8000-000000000005'}
for (const [name,id] of Object.entries(ids)) {
 await db.query("insert into auth.users values($1,$2,now())",[id,`${name}@example.test`])
 await db.query("insert into public.profiles(id,email,nombre,bio,verificado) values($1,$2,$3,'Resumen profesional de prueba',true)",[id,`${name}@example.test`,name])
 if(!['clientOnly','admin'].includes(name)) await db.query("insert into public.profesionales(id,titulo,stripe_account_id,stripe_onboarding_completado,stripe_transferencias_habilitadas,stripe_payouts_habilitados) values($1,'Profesional de prueba',$2,true,true,true)",[id,`acct_${name}`])
}
await db.exec(await read('../migrations/20260921221953_empresas_equipo_identidad_auditoria.sql'))
await db.exec(await read('../migrations/20260921222030_empresa_liquidacion_destino.sql'))
await db.exec(await read('../migrations/20260921223402_empresa_facturacion_snapshot.sql'))
await db.exec(await read('../migrations/20261005163655_empresas_roles_operaciones_verificacion.sql'))
const all={perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true}
const operational={perfil:false,mensajes:true,presupuestos:true,encargos:true,equipo:false,ver_cobros:false,gestionar_cobros:false}
const invite = (email,role='miembro',perms=operational,visible=false) => rpc('empresa_crear_invitacion',[email,'Cargo de prueba',role,JSON.stringify(perms),visible])
await db.query('update public.profiles set es_admin=true where id=$1',[ids.platformAdmin])
await asRole('authenticated',ids.owner)
ids.company=await rpc('vincular_mi_empresa',[null,'Empresa propia','B00000001','DOC','Dirección',null,'Madrid'])
let workspace=await rpc('empresa_workspace')
check(workspace.miembros[0].rol==='principal' && workspace.miembros[0].permisos.gestionar_cobros,'Titular tiene rol persistido y permisos completos')
check(workspace.empresa.estado_verificacion==='borrador','Nueva empresa queda en borrador')
check(await rpc('empresa_comprobar_permiso',[ids.company,'equipo'])===true,'Permiso auténtico consultable')
await expectError(()=>db.query("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'No publicada','Prueba','Madrid')",[ids.owner,ids.company]),/verificada/,'Borrador no opera')
await asRole('anon')
check(await rpc('empresa_perfil_publico',[ids.company])===null,'Borrador no tiene perfil público')
check((await rpc('empresas_publicas')).length===0,'Borrador no aparece en directorio')
await expectError(()=>rpc('empresa_verificaciones_listar'),/permission denied/,'Anon no enumera expedientes')
await asRole('authenticated',ids.owner)
await expectError(()=>db.query('update public.empresas set verificada=true,estado_verificacion=\'verificada\' where id=$1',[ids.company]),/permission denied/,'Titular no se verifica directamente')
await expectError(()=>rpc('empresa_revisar_verificacion',[ids.company,'verificada','Yo me apruebo']),/Solo el equipo/,'Titular no aprueba')
await expectError(()=>rpc('empresa_solicitar_verificacion',['documental','Titular','Administrador','test.pdf',Buffer.from('not a pdf').toString('base64'),true]),/PDF/,'No acepta documento no PDF')
await expectError(()=>rpc('empresa_solicitar_verificacion',['documental','Titular','Administrador','test.pdf',Buffer.from('%PDF-test').toString('base64'),false]),/autorización/,'Consentimiento obligatorio')
await rpc('empresa_solicitar_verificacion',['documental','Titular','Administrador','test.pdf',Buffer.from('%PDF-test').toString('base64'),true])
check((await rpc('empresa_workspace')).empresa.estado_verificacion==='en_revision','Presentación persiste estado de revisión')
await expectError(()=>rpc('empresa_solicitar_verificacion',['documental','Otro','Cargo','test.pdf',Buffer.from('%PDF-test').toString('base64'),true]),/pendiente/,'No sustituye documentación en revisión')
await asRole('authenticated',ids.outsider)
await expectError(()=>rpc('empresa_verificacion_documento',[ids.company]),/No tienes acceso/,'Ajeno no descarga documento')
await expectError(()=>rpc('empresa_verificaciones_listar'),/No tienes permiso/,'Usuario ordinario no lista verificaciones')
await asRole('authenticated',ids.platformAdmin)
check((await rpc('empresa_verificaciones_listar'))[0].empresa_id===ids.company,'Administrador Diime lista expedientes')
check((await rpc('empresa_verificacion_documento',[ids.company])).nombre==='test.pdf','Administrador Diime accede a documento privado')
await rpc('empresa_revisar_verificacion',[ids.company,'requiere_informacion','Falta poder actualizado'])
await asRole('authenticated',ids.owner)
check((await rpc('empresa_workspace')).verificacion.nota_revision==='Falta poder actualizado','Principal recibe motivo de revisión')
await rpc('empresa_solicitar_verificacion',['documental','Titular','Administrador','poder.pdf',Buffer.from('%PDF-new').toString('base64'),true])
await asRole('authenticated',ids.platformAdmin)
await rpc('empresa_revisar_verificacion',[ids.company,'verificada','Identidad y poder comprobados con documentación de prueba'])
await asRole('anon')
check((await rpc('empresa_perfil_publico',[ids.company])).miembros.length===0,'Empresa aprobada publica solo miembros que aceptan visibilidad')
await expectError(()=>db.query('select documento from diime_private.empresa_verificaciones'),/permission denied/,'Documento privado fuera del Data API')
await asRole('authenticated',ids.owner)
const adminInvitation=await invite('admin@example.test','administrador',{...all,gestionar_cobros:false})
const memberInvitation=await invite('member@example.test','miembro',operational,true)
const member2Invitation=await invite('worker2@example.test','miembro',operational,false)
await expectError(()=>invite('clientOnly@example.test','principal',all),/principal/,'No se crea segundo principal')
await expectError(()=>invite('clientOnly@example.test','miembro',{desconocido:true}),/booleanos conocidos/,'Permiso desconocido rechazado')
await asRole('authenticated',ids.admin)
await rpc('empresa_aceptar_invitacion',[adminInvitation.token])
check((await rpc('empresa_workspace')).miembros.find(x=>x.usuario_id===ids.admin).tiene_perfil_profesional===false,'Administrador sin ficha profesional puede incorporarse')
check((await rpc('empresa_contexto_actual')).rol==='administrador','Rol invitado persistido')
await expectError(()=>invite('clientOnly@example.test','administrador',operational),/principal/,'Administrador no nombra administradores')
await expectError(()=>invite('clientOnly@example.test','miembro',all),/no tienes/,'Administrador no escala permisos')
await expectError(()=>rpc('empresa_actualizar_miembro',[ids.owner,'Hack',true,null,null,null]),/principal/,'Administrador no revoca principal')
await expectError(()=>rpc('empresa_actualizar_miembro',[ids.admin,'Hack',false,'administrador',JSON.stringify(all),null]),/propios permisos/,'Administrador no aumenta sus propios permisos')
await expectError(()=>rpc('empresa_verificacion_documento',[ids.company]),/No tienes acceso/,'Admin empresa no recibe documentación de representación')
const staleInvitation=await invite('clientOnly@example.test','miembro',{mensajes:true})
await asRole('authenticated',ids.owner)
await rpc('empresa_actualizar_miembro',[ids.admin,'Gestor',false,'administrador',JSON.stringify({...all,equipo:false,gestionar_cobros:false}),false])
await asRole('authenticated',ids.clientOnly)
await expectError(()=>rpc('empresa_aceptar_invitacion',[staleInvitation.token]),/autorización.*vigente/,'Invitación no conserva permisos del creador que perdió autorización')
await asRole('authenticated',ids.owner)
await rpc('empresa_actualizar_miembro',[ids.admin,'Gestor',false,'administrador',JSON.stringify({...all,gestionar_cobros:false}),false])
await asRole('authenticated',ids.member)
await rpc('empresa_aceptar_invitacion',[memberInvitation.token])
await asRole('authenticated',ids.worker2)
await rpc('empresa_aceptar_invitacion',[member2Invitation.token])
await asRole('anon')
const publicProfile=await rpc('empresa_perfil_publico',[ids.company])
check(publicProfile.miembros.length===1 && publicProfile.miembros[0].usuario_id===ids.member,'Equipo público respeta consentimiento individual')
check(await rpc('empresa_afiliacion_publica',[ids.worker2])===null,'Afiliación privada no revelada')
check(!/cif|permisos|stripe|documento|@example/.test(JSON.stringify(publicProfile)),'Proyección pública no filtra datos internos')
await asRole('authenticated',ids.member)
await expectError(()=>invite('clientOnly@example.test'),/No tienes permiso/,'Miembro sin equipo no invita')
await expectError(()=>rpc('empresa_editar_perfil',['Intruso','Cambio','Madrid',null,null,[]]),/No tienes permiso/,'Miembro sin perfil no edita')
await asRole('authenticated',ids.admin)
await rpc('empresa_editar_perfil',['Marca comercial','Presentación','Madrid',null,null,[]])
check((await rpc('empresa_workspace')).empresa.razon_social==='Empresa propia','Editar marca comercial no cambia razón social acreditada')
await asRole('authenticated',ids.member)
// Produce personal and company records for the same actor: admin must not see personal work.
const personalRequest=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'PERSONAL PRIVADO','Secreto personal','Madrid') returning id",[ids.member])).id
ids.companyRequest=(await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Compra empresa','Equipo','Madrid') returning id",[ids.member,ids.company])).id
await asRole('authenticated',ids.client)
ids.request=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Cliente externo','Encargo','Madrid') returning id",[ids.client])).id
await asRole('authenticated',ids.member)
ids.offer=(await one("insert into public.ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,100,2,'Oferta empresa',5,0,5,95) returning id",[ids.request,ids.member,ids.company])).id
await asRole('authenticated',ids.client)
ids.job=(await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',[ids.offer,ids.request,ids.member])).value.trabajo.id
check((await one("select empresa_nombre from public.facturacion_trabajo($1) where parte='profesional'",[ids.job])).empresa_nombre==='Empresa propia','Snapshot fiscal usa razón social y no marca comercial editable')
await asRole('authenticated',ids.outsider)
const personalOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,2,'Oferta personal',5,0,5,95) returning id",[personalRequest,ids.outsider])).id
await asRole('authenticated',ids.member)
const personalJob=(await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',[personalOffer,personalRequest,ids.outsider])).value.trabajo.id
await asRole()
await db.query("insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado) values($1,$2,$3,'cliente','INCIDENCIA PERSONAL NO EMPRESA','abierta')",[personalJob,ids.member,ids.outsider])
const companyDispute=(await one("insert into public.disputas(trabajo_id,cliente_id,profesional_id,tipo,motivo,estado) values($1,$2,$3,'cliente','Incidencia del servicio empresarial','en_revision') returning id",[ids.job,ids.client,ids.member])).id
await db.query("update public.trabajos set notas_privadas_proveedor='NOTA SECRETA PERSONAL',estado='en_progreso',cancelacion_estado='pendiente',cancelacion_solicitada_por=$2,cancelacion_razon='Motivo de cancelación empresarial' where id=$1",[ids.job,ids.client])
await asRole('authenticated',ids.admin)
workspace=await rpc('empresa_workspace')
check(workspace.operaciones.solicitudes.some(s=>s.id===ids.companyRequest),'Admin ve solicitudes de otro miembro')
check(workspace.operaciones.ofertas.some(s=>s.id===ids.offer),'Admin ve ofertas de otro miembro')
check(workspace.operaciones.trabajos.some(s=>s.id===ids.job),'Admin ve contratos de otro miembro')
const incidentView=workspace.operaciones.trabajos.find(s=>s.id===ids.job)
check(incidentView.cancelacion_estado==='pendiente' && incidentView.cancelacion_razon==='Motivo de cancelación empresarial','Admin ve contexto mínimo de cancelación de empresa')
check(incidentView.disputa_actual.id===companyDispute && incidentView.disputa_actual.estado==='en_revision','Admin puede supervisar la disputa empresarial')
check(Object.keys(incidentView.disputa_actual).sort().join(',')==='estado,id,motivo,resolucion,resultado','Disputa usa proyección mínima explícita')
check(!JSON.stringify(workspace).includes('INCIDENCIA PERSONAL NO EMPRESA'),'Admin no recibe incidencias de contratos personales del equipo')

check(!JSON.stringify(workspace).includes(personalRequest) && !JSON.stringify(workspace).includes('NOTA SECRETA') && !JSON.stringify(workspace).includes('PERSONAL PRIVADO'),'Admin no obtiene operaciones personales ni notas privadas')
check(workspace.actividad.some(a=>a.actor_usuario_id===ids.member && a.entidad_id===ids.offer),'Admin ve auditoría humana de otro miembro')
await asRole('authenticated',ids.worker2)
workspace=await rpc('empresa_workspace')
check(workspace.operaciones.trabajos.length===0 && workspace.operaciones.ofertas.length===0 && workspace.operaciones.solicitudes.length===0,'Miembro no ve encargos ajenos no asignados')
await expectError(()=>rpc('empresa_reasignar_trabajo',[ids.job,ids.worker2,'proveedor']),/administradores/,'Miembro no se asigna encargos ajenos')
await asRole('authenticated',ids.admin)
await rpc('empresa_reasignar_trabajo',[ids.job,ids.worker2,'proveedor'])
await asRole('authenticated',ids.worker2)
check((await rpc('empresa_workspace')).operaciones.trabajos.some(t=>t.id===ids.job),'Nuevo operador ve encargo asignado')
check((await rpc('empresa_workspace')).operaciones.trabajos.find(t=>t.id===ids.job).disputa_actual.motivo==='Incidencia del servicio empresarial','Operador asignado recibe contexto de la incidencia que debe gestionar')
await asRole()
await db.query("update public.disputas set estado='resuelta',resolucion='Acuerdo documentado de prueba',resultado='proveedor' where id=$1",[companyDispute])
await db.query("update public.trabajos set cancelacion_estado=null,cancelacion_solicitada_por=null,cancelacion_razon=null where id=$1",[ids.job])
await asRole('authenticated',ids.worker2)

check(await rpc('empresa_puede_operar_trabajo',[ids.job,'encargos','proveedor'])===true,'Nuevo operador autorizado para proveedor')
check(await rpc('empresa_puede_operar_trabajo',[ids.job,'encargos','cliente'])===false,'Permiso no cruza al lado cliente')
await rpc('empresa_actualizar_trabajo',[ids.job,50,false])
await asRole('authenticated',ids.member)
check(await rpc('empresa_puede_operar_trabajo',[ids.job,'encargos','proveedor'])===false,'Original sin asignación no opera')
await expectError(()=>rpc('empresa_actualizar_trabajo',[ids.job,80,false]),/No puedes actualizar/,'Original no modifica encargo reasignado')
await asRole('authenticated',ids.owner)
await rpc('empresa_actualizar_miembro',[ids.member,null,true,null,null,null])
await asRole('authenticated',ids.member)
check(await rpc('empresa_workspace')===null && await rpc('empresa_contexto_actual')===null,'Revocación corta workspace y contexto inmediatamente')
await asRole('authenticated',ids.worker2)
await rpc('empresa_actualizar_trabajo',[ids.job,100,true])
await asRole()
const job=await one('select * from public.trabajos where id=$1',[ids.job])
check(job.estado==='entregado' && job.progreso===100,'Reasignado puede entregar tras baja original')
check(job.profesional_id===ids.member && job.actor_contratacion_id===ids.client && job.empresa_proveedora_id===ids.company,'Reasignación conserva autores y proveedor económico')
check(job.operador_proveedor_id===ids.worker2,'Operador registrado separado')
check((await one("select count(*)::int n from public.empresa_actividad where empresa_id=$1 and actor_usuario_id=$2 and entidad_id=$3",[ids.company,ids.member,ids.offer])).n>0,'Auditoría original permanece tras baja')
await asRole('authenticated',ids.owner)
await rpc('empresa_actualizar_miembro',[ids.worker2,'Sin permisos',false,'miembro',JSON.stringify({mensajes:true}),false])
await asRole('authenticated',ids.worker2)
check((await rpc('empresa_workspace')).operaciones.trabajos.length===0,'Retirar permiso quita acceso al encargo asignado')
check(await rpc('empresa_puede_operar_trabajo',[ids.job,'encargos','proveedor'])===false,'Retirar permiso deniega endpoint operativo')
await asRole('authenticated',ids.owner)
await expectError(()=>rpc('empresa_actualizar_miembro',[ids.owner,null,true,null,null,null]),/principal/,'Principal no se puede revocar')
await rpc('empresa_actualizar_miembro',[ids.owner,'Dirección',false,'principal',JSON.stringify({mensajes:true}),true])
check((await rpc('empresa_contexto_actual')).permisos.equipo===true,'Principal conserva permisos necesarios al editar visibilidad')
await asRole()
const publicDefiners=await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'empresa%' and p.prosecdef")
check(publicDefiners.rows.length===0,'Todos los endpoints públicos son invoker')
check((await one("select relrowsecurity from pg_class where oid='diime_private.empresa_verificaciones'::regclass")).relrowsecurity,'Expedientes con RLS adicional')
// Additional agents contribute isolated integration scenarios after the role assertions.
if (process.env.EMPRESAS_FULL_INTEGRATION!=='0') {
 await db.exec(await read('../migrations/20261005163946_empresa_chat_acceso_y_mensajes.sql'))
 const { runChatScenarios }=await import('./empresachat-scenarios.mjs')
 await runChatScenarios({db,asRole,ids,expectError,one,rpc,check})
 await asRole()
 await db.exec(await read('../migrations/20261005164234_empresa_stripe_independiente.sql'))
 const { testStripeEmpresa }=await import('./empresa-stripe-scenarios.mjs')
 await testStripeEmpresa({db,asRole,ids,expectError,one,rpc,check})
 await asRole()
 await db.exec(await read('../migrations/20261005180450_proteger_avisos_empresa_revocacion.sql'))
 const { testAvisosEmpresa }=await import('./empresa-notificaciones-scenarios.mjs')
 await testAvisosEmpresa({db,asRole,ids,one,check})
}
await asRole()
await db.exec(await read('../migrations/20261005182958_empresas_provincias_servicios_canonicos.sql'))
const { testCoberturaEmpresa } = await import('./empresa-cobertura-scenarios.mjs')
await testCoberturaEmpresa({ db, asRole, ids, one, rpc, check, expectError })
await asRole()
await db.exec(await read('../migrations/20261005192538_empresa_vista_previa_privada.sql'))
const { testVistaPreviaEmpresa } = await import('./empresa-preview-scenarios.mjs')
await testVistaPreviaEmpresa({ db, asRole, ids, one, rpc, check, expectError })
console.log(`OK ${assertions} comprobaciones PostgreSQL: roles reales, revisión, permisos, alcance, privacidad y continuidad.`)
await db.close()
