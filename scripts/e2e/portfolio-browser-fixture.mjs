import fs from 'node:fs';
import assert from 'node:assert/strict';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur');
const [mode='snapshot',alias='PP',suffix='current']=process.argv.slice(2);
assert.ok(['PP','PE_TITULAR','PE_ADMIN','PE_MIEMBRO'].includes(alias));
try {
 const rows=(await f.db.query('select *, fecha_proyecto::text as fecha_proyecto from portfolio where profesional_id=$1 order by created_at',[f.m.users[alias].id])).rows;
 if(mode==='unlink'||mode==='restore-image') {
  const targets=JSON.parse(fs.readFileSync(f.dir+'/reviews-eur-browser-targets.json'));
  const target=targets.find(t=>t.pa===alias),row=mode==='restore-image'?JSON.parse(fs.readFileSync(f.dir+'/portfolio-'+alias+'-before-unlink.json')):rows.find(r=>r.trabajo_id===target.id);
  assert.ok(row,'Existing browser-created verified item required');
  if(mode==='unlink')fs.writeFileSync(f.dir+'/portfolio-'+alias+'-before-unlink.json',JSON.stringify(row,null,2));
  const c=await f.client(alias,['/mi-perfil']);
  const data={titulo:row.titulo,descripcion:row.descripcion,imagen_url:row.imagenes?.[0]||'',categoria:row.categoria,fecha_completado:row.fecha_proyecto,ubicacion:row.ubicacion,duracion:row.duracion,presupuesto:String(row.presupuesto),contexto_proveedor:row.contexto_proveedor};
  const result=(await c.call('actualizarItemPortfolio',[row.id,data],{route:'/mi-perfil'})).value;
  assert.ok(result.data?.id,JSON.stringify(result));
 }
 const items=(await f.db.query('select *, fecha_proyecto::text as fecha_proyecto from portfolio where profesional_id=$1 order by created_at',[f.m.users[alias].id])).rows;
 const vis=await f.client('VIS'),pub=await vis.supabase.rpc('portfolio_publico',{p_profesional_id:f.m.users[alias].id});
 assert.equal(pub.error,null);
 fs.writeFileSync(f.dir+'/portfolio-'+alias+'-'+suffix+'.json',JSON.stringify({at:new Date().toISOString(),alias,items,public:pub.data},null,2));
 console.log(alias,mode,items.map(r=>({id:r.id,titulo:r.titulo,verified:!!r.trabajo_id,date:r.fecha_proyecto,amount:r.presupuesto})));
} finally {await f.db.end();}
