import fs from 'node:fs'
import assert from 'node:assert/strict'
const dir='.build/e2e-20261014',alias=process.argv[2],cohort=process.argv[3]||''
assert.match(cohort,/^[a-z0-9-]*$/)
const roles={CP:'cliente_particular',CE_TITULAR:'cliente_empresa_titular',CE_ADMIN:'cliente_empresa_administrador',CE_MIEMBRO:'cliente_empresa_miembro'}
assert.ok(roles[alias])
const fixture=JSON.parse(fs.readFileSync(dir+'/fixture-manifest'+(cohort?'-'+cohort:'')+'.json'))
const expected=fixture.users[alias].name+' Aislado'
const phases=['perfil','recargado','salida','denegado']
const files=phases.map(phase=>`browser/T006-${alias}-${phase}.txt`)
const contents=files.map(file=>fs.readFileSync(dir+'/'+file,'utf8'))
for(const text of contents.slice(0,2)){assert.ok(text.includes(`heading ${expected},`));assert.ok(text.includes('localhost:3200/mi-perfil'))}
assert.ok(contents[2].includes('Description: Entrar'))
assert.ok(contents[3].includes('URL: "http://localhost:3200/auth/login'))
assert.ok(contents[3].includes('button Iniciar Sesión'))
for(const text of contents.slice(2))assert.ok(!text.includes(expected))
const event={eventId:'root-T006-production-local-'+alias,caseId:'T-006',roleKey:roles[alias],level:'browser_e2e',scope:'full',status:'pass',at:new Date().toISOString(),environment:{baseUrl:'http://localhost:3200',database:'isolated-local',app:'next start optimized build'},assertions:[{name:'Entrada con credenciales del actor abre su perfil privado',pass:true},{name:'Recarga conserva la identidad y los datos correctos',pass:true},{name:'Cerrar sesión y volver a URL privada requiere iniciar sesión sin mostrar datos del actor anterior',pass:true}],evidence:files.map(path=>({layer:'browser',path})),stepsPending:[],limitations:['Navegador web. No se extrapola a OAuth ni a dispositivos nativos.']}
const file=dir+'/root-continuation-events.jsonl'
assert.ok(!fs.readFileSync(file,'utf8').includes('"eventId":"'+event.eventId+'"'))
fs.appendFileSync(file,JSON.stringify(event)+'\n');console.log({actor:alias,status:'browser E2E passed'})
