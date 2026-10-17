import fs from 'node:fs';import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur'),file=f.dir+'/progress-browser-fixtures.json',action=process.argv[2];
try {
 if(action==='prepare') {
  assert.ok(!fs.existsSync(file),'Use existing fixtures');
  const source=fs.readdirSync(f.dir).filter(n=>/^progress-history-after-\d+\.json$/.test(n)).sort().at(-1);assert.ok(source);
  const input=JSON.parse(fs.readFileSync(f.dir+'/'+source));assert.equal(input.checks.length,4);assert.ok(input.checks.every(c=>c.pass&&c.recoveryPassed));
  fs.writeFileSync(file,JSON.stringify({source,jobs:input.jobs.map(j=>({...j,roleKey:f.m.users[j.pa].roleKey,failEnabled:true,message:'Progreso recuperable T097 '+j.pa}))},null,2));
 }
 const data=JSON.parse(fs.readFileSync(file));
 if(action==='prepare'||action==='release') {
  if(action==='release') {const j=data.jobs.find(j=>j.pa===process.argv[3]);assert.ok(j);j.failEnabled=false;}
  const ids=data.jobs.filter(j=>j.failEnabled).map(j=>{assert.match(j.trabajoId,/^[a-f0-9-]{36}$/);return `'${j.trabajoId}'::uuid`});
  await f.db.query('drop trigger if exists qa_e2e_progress_browser_fail on public.actualizaciones_trabajo; drop function if exists diime_private.qa_e2e_progress_browser_fail()');
  if(ids.length)await f.db.query(`create function diime_private.qa_e2e_progress_browser_fail() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'QA_BROWSER_PROGRESS_FAILURE'; end $$; create trigger qa_e2e_progress_browser_fail before insert on public.actualizaciones_trabajo for each row when(new.tipo='progreso' and new.trabajo_id=any(array[${ids.join(',')}])) execute function diime_private.qa_e2e_progress_browser_fail()`);
  fs.writeFileSync(file,JSON.stringify(data,null,2));console.log({armed:data.jobs.filter(j=>j.failEnabled).map(j=>j.pa)});
 } else if(action==='state') {
  const alias=process.argv[3],phase=process.argv[4];assert.match(phase,/^[a-z-]+$/);const j=data.jobs.find(j=>j.pa===alias);assert.ok(j);
  const job=(await f.db.query('select estado,progreso,updated_at from trabajos where id=$1',[j.trabajoId])).rows[0];
  const history=(await f.db.query("select mensaje,progreso,usuario_id,created_at from actualizaciones_trabajo where trabajo_id=$1 and tipo='progreso' order by created_at",[j.trabajoId])).rows;
  const notices=(await f.db.query("select tipo,usuario_id from notificaciones where metadata->>'trabajo_id'=$1 and tipo='progreso_trabajo'",[j.trabajoId])).rows;
  const result={alias,phase,jobId:j.trabajoId,...job,history,notices,at:new Date().toISOString()};fs.writeFileSync(f.dir+`/progress-browser-${alias}-${phase}.json`,JSON.stringify(result,null,2));console.log({alias,phase,...job,history:history.length,notices:notices.length});
 } else throw Error('Unknown action');
} finally {await f.db.end();}
