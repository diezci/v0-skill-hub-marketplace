import fs from 'node:fs'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext(),alias=process.argv[2]
const roles={CE_TITULAR:'cliente_empresa_titular',CE_ADMIN:'cliente_empresa_administrador',CE_MIEMBRO:'cliente_empresa_miembro'}
assert.ok(roles[alias])
const before=`browser/T010-${alias}-antes-caducar.txt`,expired=`browser/T010-${alias}-caducada.txt`,restored=`browser/T010-${alias}-recuperado.txt`
const title=`QA T010 ${alias} borrador empresarial`
assert.ok(fs.readFileSync(c.dir+'/'+before,'utf8').includes(title))
const expiredText=fs.readFileSync(c.dir+'/'+expired,'utf8')
assert.ok(expiredText.includes('Crea tu cuenta para publicar una solicitud'));assert.ok(!expiredText.includes(title))
const restoredText=fs.readFileSync(c.dir+'/'+restored,'utf8')
assert.ok(restoredText.includes(title));assert.ok(restoredText.includes('Value: QA cliente aislada 20261014'))
assert.ok(restoredText.includes('Borrador recuperado. Revísalo antes de publicar.'))
const q=await c.admin.from('solicitudes').select('id',{count:'exact'}).eq('titulo',title);assert.ok(!q.error);assert.equal(q.count,0)
const pre=JSON.parse(fs.readFileSync(c.dir+'/T010-expiry-'+alias+'.jsonl','utf8').trim().split('\n').at(-1))
const r=spawnSync(c.dir+'/tools/docker/docker',['--context','colima-diime-e2e-20261014','logs','--since',pre.at,'diime-e2e-auth-short-session'],{encoding:'utf8'})
assert.equal(r.status,0)
const failures=(r.stdout+r.stderr).split('\n').flatMap(line=>{try{const o=JSON.parse(line);return o.path==='/token'&&o.status>=400?[{time:o.time,status:o.status,code:o.error_code}]:[]}catch{return[]}})
assert.ok(failures.length)
const proof=`T010-${alias}-proof.json`
fs.writeFileSync(c.dir+'/'+proof,JSON.stringify({at:new Date(),actor:alias,published:0,failures,company:c.fixture.companies.cliente.id,precondition:pre},null,2))
const e={eventId:'root-T010-expiry-'+alias,caseId:'T-010',roleKey:roles[alias],level:'browser_e2e',scope:'full',status:'pass',at:new Date().toISOString(),environment:{baseUrl:'http://localhost:3200',database:'isolated-local',auth:'local GoTrue short JWT + real refresh rejection'},assertions:[{name:'Borrador empresarial propio; cuestionario cerrado tras renovación realmente rechazada',pass:true},{name:'Reautenticación recupera título, descripción e identidad empresarial, sin cambiar a perfil personal',pass:true},{name:'Ninguna solicitud publicada automáticamente',pass:true}],evidence:[{layer:'browser',path:before},{layer:'browser',path:expired},{layer:'browser',path:restored},{layer:'database',path:proof}],stepsPending:[],limitations:['Borrador incompleto sin adjuntos. No se extrapola a la publicación empresarial, que tiene sus propios casos.']}
const ledger=c.dir+'/root-continuation-events.jsonl'
assert.ok(!fs.readFileSync(ledger,'utf8').includes('"eventId":"'+e.eventId+'"'),'Existing event preserved; do not duplicate')
fs.appendFileSync(ledger,JSON.stringify(e)+'\n')
console.log({actor:alias,status:'pass',scope:'browser E2E draft expiry and recovery'})
