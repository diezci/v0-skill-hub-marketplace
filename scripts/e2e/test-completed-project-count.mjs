// Database transition/concurrency tests are technical regressions, not payment
// E2E proof. The genuinely settled EUR contracts are checked separately below.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur'),checks=[],fixtures=[];
async function count(alias,db=f.db){return (await db.query('select total_trabajos from profesionales where id=$1',[f.m.users[alias].id])).rows[0].total_trabajos;}
async function correct(alias){const expected=(await f.db.query("select count(*)::int n from trabajos where profesional_id=$1 and estado='completado'",[f.m.users[alias].id])).rows[0].n;assert.equal(await count(alias),expected);return expected;}
async function fixtureJob(alias){
 await f.db.query('begin');try{
  await f.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.m.users.CP.id,role:'authenticated'})]);await f.db.query('set local role authenticated');
  const s=(await f.db.query("insert into solicitudes(cliente_id,categoria_id,titulo,descripcion,ubicacion,estado) values($1,$2,'QA contador de proyectos','Fixture técnico para transiciones del contador; no representa un pago.','Madrid','abierta') returning id",[f.m.users.CP.id,f.m.categories.general])).rows[0];
  await f.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.m.users[alias].id,role:'authenticated'})]);
  const o=(await f.db.query("insert into ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,8,'horas','Oferta sintética con alcance completo','pendiente',10,2,10,90) returning id",[s.id,f.m.users[alias].id])).rows[0];
  await f.db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.m.users.CP.id,role:'authenticated'})]);
  const j=(await f.db.query('select aceptar_oferta_y_crear_trabajo($1,$2,$3,null) result',[o.id,s.id,f.m.users[alias].id])).rows[0].result.trabajo;await f.db.query('reset role');await f.db.query('commit');fixtures.push({alias,id:j.id,request:s.id});return j.id;
 }catch(e){await f.db.query('rollback');throw e;}
}
try{
 for(const alias of ['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO']){
  const initial=await correct(alias),id=await fixtureJob(alias);assert.equal(await count(alias),initial);
  await f.db.query('begin');try{
   await f.db.query("update trabajos set estado='completado' where id=$1",[id]);assert.equal(await count(alias),initial+1);
   await f.db.query("update trabajos set estado='completado' where id=$1",[id]);assert.equal(await count(alias),initial+1);
   await f.db.query("update trabajos set estado='en_progreso' where id=$1",[id]);assert.equal(await count(alias),initial);
   await f.db.query("update trabajos set estado='completado' where id=$1",[id]);assert.equal(await count(alias),initial+1);
   await f.db.query('delete from trabajos where id=$1',[id]);assert.equal(await count(alias),initial);
  }finally{await f.db.query('rollback');}
  assert.equal(await count(alias),initial);
  const c=await f.client(alias,['/mi-perfil']);const forged=await c.supabase.from('profesionales').update({total_trabajos:99999}).eq('id',f.m.users[alias].id).select('total_trabajos');assert.equal(forged.error?.code,'42501');assert.equal(await count(alias),initial);
  const own=(await c.call('obtenerPerfilActual',[],{route:'/mi-perfil'})).value;assert.equal(own.data.profesional.proyectos_completados,initial);
  const vis=await f.client('VIS',['/profesionales']);const pub=(await vis.call('obtenerProfesionalPorId',[f.m.users[alias].id],{route:'/profesionales'})).value;assert.equal(pub.data.proyectos_completados,initial);
  checks.push({alias,pass:true,initial,backfill:true,repeatIdempotent:true,rollback:true,reopen:true,delete:true,forgeryDenied:true,ownAndAnonymousRead:true});console.log('PASS count',alias,initial);
 }
 const a=fixtures.find(x=>x.alias==='PP').id,b=await fixtureJob('PP'),initial=await count('PP');
 const {default:pg}=await import('../../.build/workflow-db/node_modules/pg/lib/index.js');const connections=[new pg.Client({connectionString:f.env.DATABASE_URL}),new pg.Client({connectionString:f.env.DATABASE_URL})];
 try{await Promise.all(connections.map(c=>c.connect()));await Promise.all(connections.map((c,i)=>c.query("update trabajos set estado='completado' where id=$1",[[a,b][i]])));assert.equal(await count('PP'),initial+2);await correct('PP');checks.push({name:'Concurrent completions do not lose increments',pass:true});}
 finally{await Promise.all(connections.map(c=>c.end()));await f.db.query("update trabajos set estado='pendiente_pago' where id=any($1)",[[a,b]]);}
 assert.equal(await count('PP'),initial);console.log('PASS concurrent increments and reset');
}catch(error){checks.push({pass:false,error:error.message});console.error(error);process.exitCode=1;}
finally{await f.db.end();fs.writeFileSync(f.dir+'/completed-project-count-tests.json',JSON.stringify({at:new Date().toISOString(),scope:'Technical SQL transitions plus real Auth/HTTP public and owner read; not a payment journey',checks,fixtures},null,2));}
