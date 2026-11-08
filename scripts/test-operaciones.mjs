// Query/transport doubles: focused error, pagination and filter regressions; not E2E.
import fs from'node:fs';import vm from'node:vm';import ts from'typescript';import assert from'node:assert/strict';
const NOW=Date.parse('2026-11-06T12:00:00.000Z');
const ago=m=>new Date(NOW-m*60000).toISOString();
class FixedDate extends Date { static now(){return NOW} }
const dataset={eventos_operativos:[{id:'event_open',estado:'abierto'},{id:'event_closed',estado:'resuelto'}],stripe_eventos_webhook:[{id:'wh_error',estado:'error'},{id:'wh_stuck',estado:'procesando',ultimo_intento_at:ago(20)},{id:'wh_fresh',estado:'procesando',ultimo_intento_at:ago(5)},{id:'wh_completed',estado:'completado'}],transacciones_escrow:[{id:'settle_error',liquidacion_estado:'error'},{id:'settle_stuck',liquidacion_estado:'procesando',updated_at:ago(20)},{id:'settle_fresh',liquidacion_estado:'procesando',updated_at:ago(5)},{id:'settle_completed',liquidacion_estado:'completada'}],disputas:[{id:'dispute_old',estado:'abierta',created_at:ago(1500)},{id:'dispute_review',estado:'en_revision',created_at:ago(1500)},{id:'dispute_fresh',estado:'abierta',created_at:ago(60)},{id:'dispute_closed',estado:'resuelta',created_at:ago(1500)}],incidencias:[{id:'incident_open',prioridad:'critica',estado:'abierta'},{id:'incident_review',prioridad:'critica',estado:'en_revision'},{id:'incident_closed',prioridad:'critica',estado:'cerrada'},{id:'incident_notcritical',prioridad:'media',estado:'abierta'}],solicitudes:[{id:'request_old',estado:'abierta',total_ofertas:0,ubicacion:'Madrid Centro',created_at:ago(300)},{id:'request_othercity',estado:'abierta',total_ofertas:0,ubicacion:'Barcelona',created_at:ago(300)},{id:'request_fresh',estado:'abierta',total_ofertas:0,ubicacion:'Madrid',created_at:ago(60)},{id:'request_hasbid',estado:'abierta',total_ofertas:1,ubicacion:'Madrid',created_at:ago(300)},{id:'request_closed',estado:'completada',total_ofertas:0,ubicacion:'Madrid',created_at:ago(300)}]};
const offerStates=['pendiente','enviada','en_negociacion','aceptada','rechazada','retirada'];
const request=(id,changes={})=>({id,titulo:id,estado:'abierta',total_ofertas:0,ubicacion:'Madrid',created_at:ago(1500),...changes});
dataset.solicitudes=[request('request_old',{ubicacion:'Madrid Centro'}),request('request_othercity',{ubicacion:'Barcelona'}),request('request_stale_positive',{ubicacion:'Bilbao',total_ofertas:8}),request('request_at_24h',{ubicacion:'Lugo',created_at:ago(1440)}),request('request_before_24h',{created_at:new Date(NOW-24*60*60000+1).toISOString()}),request('request_fresh',{created_at:ago(60)}),...offerStates.map(estado=>request(`request_offer_${estado}`)),...['en_progreso','completada','cancelada','cerrada'].map(estado=>request(`request_${estado}`,{estado}))];
dataset.ofertas=offerStates.map(estado=>({id:`offer_${estado}`,solicitud_id:`request_offer_${estado}`,estado}));
function database({failIndex=-1,missingCount=-1}={}){
 let n=0;const calls=[];
 return{calls,from(table){
  const index=n++;let rows=[...(dataset[table]||[])],offset=0,end=Infinity;
  const call={table,fields:'',head:false,orders:[],range:null};calls.push(call);
  const q={
   select(fields,options){assert.equal(options.count,'exact');call.fields=fields;call.head=!!options.head;return q},
   eq(k,v){rows=rows.filter(x=>x[k]===v);return q},in(k,v){rows=rows.filter(x=>v.includes(x[k]));return q},
   lt(k,v){rows=rows.filter(x=>x[k]<v);return q},lte(k,v){rows=rows.filter(x=>x[k]<=v);return q},
   ilike(k,v){rows=rows.filter(x=>String(x[k]).toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return q},
   is(k,v){assert.equal(v,null);if(k==='ofertas'){assert.equal(table,'solicitudes');assert.match(call.fields,/ofertas/);rows=rows.filter(row=>!dataset.ofertas.some(offer=>offer.solicitud_id===row.id))}else rows=rows.filter(row=>row[k]==null);return q},
   not(k,op,v){assert.equal(op,'is');assert.equal(v,null);rows=rows.filter(row=>row[k]!=null);return q},
   or(value){assert.equal(value,'contracargo_conciliacion->>estado.is.null,contracargo_conciliacion->>estado.neq.completada');rows=rows.filter(row=>row.contracargo_conciliacion?.estado!=='completada');return q},
   order(k,options={}){call.orders.push({key:k,ascending:options.ascending!==false});return q},
   range(a,b){offset=a;end=b+1;call.range=[a,b];return q},
   then(resolve,reject){const sorted=[...rows].sort((a,b)=>{for(const {key,ascending}of call.orders){const result=a[key]<b[key]?-1:a[key]>b[key]?1:0;if(result)return ascending?result:-result}return 0});return Promise.resolve(index===failIndex?{data:null,error:{message:'fixture_query_'+index}}:{data:call.head?null:sorted.slice(offset,end),count:index===missingCount?null:rows.length,error:null}).then(resolve,reject)}
  };return q;
 }}
}
const catalogo={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/operaciones-catalogo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:catalogo});
function load(db){const exports={};const deps={'server-only':{},'resend':{Resend:class{constructor(){throw Error('No email permitted')}}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/operaciones-catalogo':catalogo,'@/lib/plazos-workflow':{DIAS_SIN_PAGO:15,DIAS_REVISION_ENTREGA:7}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/operaciones.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date:FixedDate,process:{env:{}},console,require:n=>deps[n]});return exports}
let count=0;async function test(name,fn){await fn();count++;console.log('PASS',name)}
const expected={eventos:['event_open'],webhooksError:['wh_error'],webhooksAtascados:['wh_stuck'],liquidacionesError:['settle_error'],liquidacionesAtascadas:['settle_stuck'],disputasVencidas:['dispute_old','dispute_review'],incidenciasCriticas:['incident_open','incident_review'],solicitudesSinOferta:['request_old','request_othercity','request_stale_positive','request_at_24h']},summary=await load(database()).obtenerResumenOperativo();assert.equal(summary.total,13)
for(const[group,ids]of Object.entries(expected))await test('Filtro exacto '+group,()=>{assert.deepEqual(Array.from(summary.detalle[group].map(x=>x.id)),ids);assert.equal(summary.totales[group],ids.length)})
for(let i=0;i<8;i++)await test('Fallo individual '+i+' impide certificar resumen vacío',async()=>assert.rejects(()=>load(database({failIndex:i})).obtenerResumenOperativo(),new RegExp('fixture_query_'+i)))
await test('Conteo ausente no se sustituye por cero',async()=>assert.rejects(()=>load(database({missingCount:0})).obtenerResumenOperativo(),/no se pudo contar/))
await test('Falta de configuración no produce resumen vacío',async()=>assert.rejects(()=>load(null).obtenerResumenOperativo(),/no está configurado/))
await test('Volumen mayor que página conserva total exacto y páginas completas',async()=>{const previous=dataset.eventos_operativos;try{dataset.eventos_operativos=Array.from({length:63},(_,i)=>({id:`event_${i}`,estado:'abierto'}));const api=load(database()),r=await api.obtenerResumenOperativo();assert.equal(r.totales.eventos,63);assert.equal(r.detalle.eventos.length,25);const all=[];for(const from of[0,25,50])all.push(...(await api.obtenerDetalleOperativo('eventos',from)).filas);assert.equal(all.length,63);assert.equal(new Set(all.map(x=>x.id)).size,63)}finally{dataset.eventos_operativos=previous}})
await test('Demandas de cualquier ubicación entran exactamente a las 24 h y no un milisegundo antes',async()=>{
 const api=load(database()),before=await api.obtenerDetalleOperativo('solicitudesSinOferta',0,NOW-1),exact=await api.obtenerDetalleOperativo('solicitudesSinOferta',0,NOW);
 assert.equal(before.filas.some(row=>row.id==='request_at_24h'),false);assert.equal(exact.filas.some(row=>row.id==='request_at_24h'),true);assert.equal(exact.filas.some(row=>row.id==='request_before_24h'),false);
 assert.deepEqual(Array.from(exact.filas.map(row=>row.ubicacion)),['Madrid Centro','Barcelona','Bilbao','Lugo']);
})
await test('Ofertas registradas en cualquier estado prevalecen sobre contadores desfasados',async()=>{
 const {filas}=await load(database()).obtenerDetalleOperativo('solicitudesSinOferta',0,NOW);
 assert.ok(filas.some(row=>row.id==='request_stale_positive'),'Un contador positivo antiguo no oculta una demanda sin ofertas');
 for(const offer of dataset.ofertas)assert.equal(filas.some(row=>row.id===offer.solicitud_id),false,`Oferta ${offer.estado} registrada excluye la demanda aunque contador sea cero`);
 for(const estado of ['en_progreso','completada','cancelada','cerrada'])assert.equal(filas.some(row=>row.estado===estado),false);
})
await test('Demandas sin oferta mantienen total exacto y orden estable en más de 25 resultados',async()=>{
 const previous=dataset.solicitudes;try{
  dataset.solicitudes=Array.from({length:63},(_,i)=>request(`request_page_${String(62-i).padStart(3,'0')}`,{ubicacion:'Bilbao',total_ofertas:i+1}));
  const api=load(database()),all=[];for(const from of[0,25,50]){const page=await api.obtenerDetalleOperativo('solicitudesSinOferta',from,NOW);assert.equal(page.total,63);assert.equal(page.filas.length,from===50?13:25);all.push(...page.filas)}
  assert.deepEqual(all.map(row=>row.id),Array.from({length:63},(_,i)=>`request_page_${String(i).padStart(3,'0')}`));
 }finally{dataset.solicitudes=previous}
})
await test('Contador de navegación usa una petición HEAD sin descargar filas y coincide con el listado',async()=>{
 const db=database(),total=await load(db).obtenerConteoSolicitudesSinOferta(NOW);
 assert.equal(total,summary.totales.solicitudesSinOferta);assert.equal(db.calls.length,1);assert.equal(db.calls[0].table,'solicitudes');assert.equal(db.calls[0].head,true);assert.equal(db.calls[0].range,null);
})
await test('Contador distingue cero confirmado de fallo, conteo ausente y falta de configuración',async()=>{
 await assert.rejects(()=>load(database({failIndex:0})).obtenerConteoSolicitudesSinOferta(NOW),/fixture_query_0/);
 await assert.rejects(()=>load(database({missingCount:0})).obtenerConteoSolicitudesSinOferta(NOW),/no se pudo contar/);
 await assert.rejects(()=>load(null).obtenerConteoSolicitudesSinOferta(NOW),/no está configurado/);
 const previous=dataset.solicitudes;try{dataset.solicitudes=[];assert.equal(await load(database()).obtenerConteoSolicitudesSinOferta(NOW),0)}finally{dataset.solicitudes=previous}
})
console.log(`${count} operational query regressions passed`)
