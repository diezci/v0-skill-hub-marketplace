// Helpers for genuine local Auth / HTTP / PostgREST tests. SQL prepares fixtures only.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {actionClient} from './http-action-client.mjs';
export async function localFixture(cohort='privacy') {
 const dir=path.resolve('.build/e2e-20261014');
 const env=Object.fromEntries((await fs.readFile(path.join(dir,'.env.supabase-local'),'utf8')).split('\n').filter(s=>/^[A-Z_]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}));
 const dburl=new URL(env.DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(dburl.hostname)&&dburl.port==='54322');
 const suffix=cohort?'-'+cohort:'';
 const m=JSON.parse(await fs.readFile(path.join(dir,'fixture-manifest'+suffix+'.json'))),creds=JSON.parse(await fs.readFile(path.join(dir,'local-credentials'+suffix+'.json')));
 const {default:pg}=await import('../../.build/workflow-db/node_modules/pg/lib/index.js');
 const db=new pg.Client({connectionString:env.DATABASE_URL});await db.connect();const clients={};
 async function client(alias,routes=['/mensajes']){if(clients[alias])return clients[alias];const c=actionClient({baseUrl:'http://127.0.0.1:3200',supabaseUrl:env.NEXT_PUBLIC_SUPABASE_URL,anonKey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY});if(alias!=='VIS')assert.equal(await c.login(creds.users[alias].email,creds.users[alias].password),m.users[alias].id);for(const route of routes)await(await c.request(route)).text();return clients[alias]=c;}
 async function request(ca='CP',label='QA isolated request'){await db.query('BEGIN');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:m.users[ca].id,role:'authenticated'})]);await db.query('SET LOCAL ROLE authenticated');const row=(await db.query("insert into solicitudes(cliente_id,empresa_id,categoria_id,titulo,descripcion,ubicacion,estado) values($1,$2,$3,$4,'Solicitud sintética aislada para comprobar todos los permisos del flujo.','Madrid','abierta') returning id",[m.users[ca].id,ca.startsWith('CE_')?m.companies.cliente.id:null,m.categories.general,label])).rows[0];await db.query('COMMIT');return row.id;}catch(e){await db.query('ROLLBACK');throw e;}}
 return{dir,env,m,db,client,request};
}
export async function saveChecks({dir,run,checks,fixtures=[],notes=[],eventsFile='client-api-events.jsonl'}){
 const matrix=JSON.parse(await fs.readFile('/Users/juan/Desktop/v0-skill-hub-marketplace/outputs/01a12fa9-diime-matriz-20261012/datos_matriz.json','utf8')),ids=new Set(matrix.rows.map(r=>r.id));
 await fs.writeFile(path.join(dir,run+'.json'),JSON.stringify({run,environment:'real isolated local Auth / Next / PostgREST / PostgreSQL',checks,fixtures,notes},null,2));
 const groups=new Map();for(const c of checks)for(const caseId of c.caseIds||[]){const rowId=caseId+'--'+c.roleKey;if(!ids.has(rowId))continue;const key=rowId;const g=groups.get(key)||{caseId,rowId,roleKey:c.roleKey,assertions:[]};g.assertions.push(c);groups.set(key,g);}
 for(const g of groups.values())await fs.appendFile(path.join(dir,eventsFile),JSON.stringify({...g,eventId:run+'-'+g.rowId,runId:'e2e-20261014',at:new Date().toISOString(),level:'api_e2e',scope:'partial',status:g.assertions.some(a=>!a.pass)?'fail':'pass',environment:{baseUrl:'http://127.0.0.1:3200'},stepsCompleted:g.assertions.map(a=>a.name),stepsPending:['Pasos de interfaz y variantes originales no incluidas en las aserciones'],evidence:[{layer:'api',path:run+'.json',description:'Real authenticated HTTP requests'},{layer:'db',path:run+'.json',description:'Independent fixture row assertions'}],blockers:[],cleanup:{environment:'isolated-local',fixturesRetained:true}})+'\n');
 console.log('RESULT',checks.length,'failed',checks.filter(c=>!c.pass).length,run);if(checks.some(c=>!c.pass))process.exitCode=1;
}
