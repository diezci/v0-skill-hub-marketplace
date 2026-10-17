import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur'),run='QA portfolio 1791997229837';
const targets=JSON.parse(fs.readFileSync(f.dir+'/reviews-eur-browser-targets.json'));
const events=f.dir+'/root-continuation-events.jsonl';
const text=name=>fs.readFileSync(f.dir+'/browser/'+name,'utf8');
try{for(const t of targets){
 const alias=t.pa,externalTitle=run+' '+alias+' externo editado';
 const external=text('portfolio-'+alias+'-external-public-detail.txt');
 for(const value of ['Proyecto externo','Fontanería','13/10/2026','2 semanas y revisión final','500€ – 1000€','renovación del baño'])assert.ok(external.includes(value),alias+' external missing '+value);
 assert.ok(!external.includes('987.65')&&!external.includes('987,65'));
 const verified=text('portfolio-'+alias+'-anonymous-verified.txt');
 for(const value of ['Trabajo verificado por Diime','Electricidad','14/10/2026','100€ – 250€','Aporte del profesional','QA '+alias+':'])assert.ok(verified.includes(value),alias+' verified missing '+value);
 const unlinked=text('portfolio-'+alias+'-anonymous-unlinked.txt');assert.ok(unlinked.includes('Proyecto externo'));assert.ok(!unlinked.includes('Trabajo verificado por Diime'));assert.ok(unlinked.includes('image '+t.titulo));
 const owner=text('portfolio-'+alias+'-owner-private-edit.txt');assert.match(owner,/987[.,]65/);
 const deleted=text('portfolio-'+alias+'-deleted-reload.txt');assert.ok(!deleted.includes(externalTitle));
 assert.equal((await f.db.query('select id from portfolio where profesional_id=$1 and titulo=$2',[f.m.users[alias].id,externalTitle])).rowCount,0);
 const evidence=['external-public-detail','anonymous-verified','anonymous-unlinked','owner-private-edit','deleted-reload'].map(s=>({layer:'browser',path:'browser/portfolio-'+alias+'-'+s+'.txt'}));
 for(const caseId of ['T-163','T-164','T-165']){
  const eventId='root-portfolio-nominal-'+caseId+'-'+alias;if(fs.readFileSync(events,'utf8').includes(eventId))continue;
  fs.appendFileSync(events,JSON.stringify({eventId,at:new Date().toISOString(),caseId,roleKey:f.m.users[alias].roleKey,level:'browser_e2e',scope:'partial',status:'pass',assertions:[{name:'Real browser external creation with QA Blob image, edit and reload; exact budget owner-only, public range and correct category/date',pass:true},{name:'Browser import of own genuinely completed EUR job preserves request text and separate contribution; anonymous public detail and owner deletion verified',pass:true},{name:'Authorized HTTP unlink removes badge in browser; foreign/incomplete bindings rejected in separate authenticated API tests',pass:true}],evidence,limitations:['Expiry and late-response branches remain separately tracked; nominal coverage alone is not a full matrix pass.','Unlink uses the real server action: the current UI has no unlink control.']})+'\n');console.log('RECORDED partial',caseId,alias);
 }
}}finally{await f.db.end();}
