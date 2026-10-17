// Authentic HTTP authorization and PostgREST tests, separate from browser E2E.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {parseEnv} from 'node:util'
import {actionClient} from './http-action-client.mjs'
const dir=path.resolve('.build/e2e-20261014'),env=parseEnv(fs.readFileSync(path.join(dir,'.env.supabase-local'),'utf8'))
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixture-manifest.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'local-credentials.json')))
const checks=[],id='11111111-1111-4111-8111-111111111111'
function credential(alias){const value=credentials.users?.[alias]??credentials[alias];if(!value?.password)throw Error(`CREDENTIAL_ALIAS_MISSING:${alias}`);return value}
async function client(alias){const c=actionClient({baseUrl:env.NEXT_PUBLIC_SITE_URL,supabaseUrl:env.NEXT_PUBLIC_SUPABASE_URL,anonKey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY});if(alias!=='VIS'){const account=credential(alias);assert.equal(await c.login(account.email??fixture.users[alias].email,account.password),fixture.users[alias].id)}return c}
const roles={VIS:'visitante',CP:'cliente_particular',CE_TITULAR:'cliente_empresa_titular',CE_ADMIN:'cliente_empresa_administrador',CE_MIEMBRO:'cliente_empresa_miembro',PP:'proveedor_particular',PE_TITULAR:'proveedor_empresa_titular',PE_ADMIN:'proveedor_empresa_administrador',PE_MIEMBRO:'proveedor_empresa_miembro',AD:'admin',AJ:'ajeno'}
async function check(caseId,alias,label,fn){const row={caseId,roleKey:roles[alias],alias,level:'api_e2e',assertion:label,at:new Date().toISOString()};try{row.observation=await fn();row.status='pass'}catch(error){row.status='fail';row.observation=error.message}checks.push(row);fs.writeFileSync(path.join(dir,'pagos-api-permissions.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify(row))}
for(const [alias,role]of Object.entries(roles)){
 const c=await client(alias)
 // Compile real action modules before resolving their manifest IDs.
 await c.request('/admin/pagos');await c.request('/admin/disputas');await c.request('/cobros');await c.request('/mi-empresa')
 if(alias!=='AD')for(const [name,args]of [['comprobarReembolsoAdmin',[id]],['reintentarReembolsoAdmin',[id,'re_e2e_not_existing']],['obtenerDisputas',[]],['resolverDisputa',[{disputa_id:id,resolucion:'cliente',nota:'Prueba E2E permiso denegado'}]]]){
   await check('PA-024',alias,`${name}: usuario no admin denegado antes de consultar/mutar finanzas`,async()=>{const r=await c.call(name,args,{route:'/admin/disputas'});assert.match(r.value?.error??'',/No autenticado|No tienes permiso/);return {http:r.status,error:r.value.error}})
 }
 if(['VIS','CP','CE_TITULAR','PP','PE_TITULAR','AD','AJ'].includes(alias))for(const [name,args]of [
 ['diime_confirmar_pago',{p_escrow:id,p_session:'cs_test_e2e_forbidden',p_payment_intent:'pi_e2e',p_charge:'ch_e2e',p_total:100,p_moneda:'eur'}],
 ['diime_reclamar_liquidacion',{p_escrow:id,p_actor:alias==='AD'?fixture.users.CP.id:fixture.users.AD.id,p_tipo:'cancelacion'}],
 ['diime_finalizar_liquidacion',{p_escrow:id,p_operacion:'e2e-op',p_charge:'ch_e2e'}],
 ['diime_cerrar_cancelacion',{p_trabajo:id,p_actor:fixture.users[alias]?.id??null}],
 ['diime_autorizar_reintento_reembolso',{p_escrow:id,p_actor:fixture.users[alias]?.id??null,p_refund:'re_e2e',p_motivo:'e2e'}],
 ['diime_registrar_estado_reembolso',{p_escrow:id,p_operacion:'e2e-op',p_refund:'re_e2e',p_estado:'succeeded'}]]){
   await check('PA-025',alias,`${name}: RPC financiera privilegiada denegada por ACL real PostgREST`,async()=>{const r=await c.supabase.rpc(name,args);assert.equal(r.error?.code,'42501');assert.match(r.error.message,/permission denied for function/);return {code:r.error.code,message:r.error.message}})
 }
 if(['PE_ADMIN','PE_MIEMBRO'].includes(alias))for(const name of ['crearEnlaceOnboardingStripeEmpresa','crearEnlaceDashboardStripeEmpresa'])await check('PA-002',alias,`${name}: cuenta bancaria empresarial reservada a titular`,async()=>{const r=await c.call(name,[fixture.companies.proveedor.id],{route:'/mi-empresa'});assert.match(r.value?.error??'',/Solo el responsable principal/);assert.ok(!r.value.data?.url);return {http:r.status,error:r.value.error}})
}
const counts=Object.fromEntries(['pass','fail'].map(s=>[s,checks.filter(c=>c.status===s).length]));console.log(JSON.stringify({counts,level:'api_e2e',browserMatrixNotCompleted:true}));if(counts.fail)process.exitCode=1
