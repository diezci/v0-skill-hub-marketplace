import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur'),alias=process.argv[2];
assert.ok(['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO'].includes(alias));
try{
 const state=JSON.parse(fs.readFileSync(f.dir+'/auth-short-session-state.json'));
 assert.ok(!state.restoredAt,'Temporary loopback-only Auth must be running');
 const result=await f.db.query('update auth.refresh_tokens set revoked=true where user_id=$1 and revoked=false returning id',[f.m.users[alias].id]);
 const latest=(await f.db.query('select id,created_at,updated_at from auth.sessions where user_id=$1 order by created_at desc limit 1',[f.m.users[alias].id])).rows[0];
 const proof={at:new Date().toISOString(),alias,revoked:result.rowCount,latestSession:latest,expirySeconds:state.expirySeconds,checkAfter:new Date(Date.now()+(state.expirySeconds+5)*1000).toISOString(),scope:'Revoked refresh credentials for one synthetic EUR actor in loopback Auth; never edited browser cookies'};
 fs.writeFileSync(f.dir+'/portfolio-'+alias+'-expiry.json',JSON.stringify(proof,null,2));console.log(proof);
}finally{await f.db.end();}
