import fs from'node:fs';import assert from'node:assert/strict';import {localFixture} from'./local-client-fixtures.mjs';
const f=await localFixture('eur'),checks=[],prepared=[];
try{
 const auth=JSON.parse(fs.readFileSync(f.dir+'/auth-short-session-state.json'));assert.ok(!auth.restoredAt);assert.equal(auth.expirySeconds,180);
 for(const alias of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']){
  const c=await f.client(alias,['/mi-perfil']),data={titulo:'QA sesión caducada '+alias,descripcion:'Registro sintético para comprobar que una sesión caducada no puede modificar el portfolio.',imagen_url:'',categoria:'Electricidad',fecha_completado:'2026-10-14',presupuesto:'66.77'};
  const result=(await c.call('crearItemPortfolio',[data],{route:'/mi-perfil'})).value;assert.ok(result.data?.id);const id=result.data.id,before=(await f.db.query('select * from portfolio where id=$1',[id])).rows[0];
  const session=await c.supabase.auth.getSession();assert.ok(session.data.session);const expiresAt=session.data.session.expires_at;
  await f.db.query('update auth.refresh_tokens set revoked=true where user_id=$1 and revoked=false',[f.m.users[alias].id]);prepared.push({alias,id,data,c,before,expiresAt});
 }
 const until=Math.max(...prepared.map(p=>p.expiresAt))*1000+5000;console.log('Prepared four real expiring Auth sessions; checking after',new Date(until).toISOString());
 fs.writeFileSync(f.dir+'/portfolio-api-expiry-pending.json',JSON.stringify({until:new Date(until).toISOString(),actors:prepared.map(({alias,id,expiresAt})=>({alias,id,expiresAt}))},null,2));
 while(Date.now()<until)await new Promise(r=>setTimeout(r,Math.min(30000,until-Date.now())));
 for(const p of prepared){const observed=[];
  for(const [name,args] of [['crearItemPortfolio',[p.data]],['actualizarItemPortfolio',[p.id,{...p.data,titulo:'No debe guardarse'}]],['eliminarItemPortfolio',[p.id]],['obtenerPortfolioPorProfesional',[f.m.users[p.alias].id]],['obtenerTrabajosCompletadosParaPortfolio',[]]]){
   const result=(await p.c.call(name,args,{route:'/mi-perfil'})).value;assert.ok(result.error);observed.push({name,result});
  }
  const after=(await f.db.query('select * from portfolio where id=$1',[p.id])).rows[0];assert.deepEqual(after,p.before);
  const raw=await p.c.supabase.from('portfolio').insert({profesional_id:f.m.users[p.alias].id,titulo:'No debe crearse',descripcion:'Sesión caducada'}).select('id');assert.ok(raw.error);
  checks.push({alias:p.alias,pass:true,observed,directCode:raw.error.code,unchanged:true,expiredAt:new Date(p.expiresAt*1000).toISOString()});console.log('PASS expired portfolio',p.alias);
 }
}catch(error){checks.push({pass:false,error:error.message});console.error(error);process.exitCode=1;}
finally{
 const creds=JSON.parse(fs.readFileSync(f.dir+'/local-credentials-eur.json'));
 for(const p of prepared){try{await p.c.login(creds.users[p.alias].email,creds.users[p.alias].password);const r=(await p.c.call('eliminarItemPortfolio',[p.id],{route:'/mi-perfil'})).value;assert.equal(r.success,true);}catch(error){checks.push({alias:p.alias,pass:false,cleanup:error.message});process.exitCode=1;}}
 await f.db.end();fs.writeFileSync(f.dir+'/portfolio-api-expiry.json',JSON.stringify({at:new Date().toISOString(),checks,scope:'Real issued JWT expiry and revoked refresh; HTTP actions and PostgREST; browser recorded separately'},null,2));
}
