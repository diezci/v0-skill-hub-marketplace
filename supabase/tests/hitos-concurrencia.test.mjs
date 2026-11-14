/** Real concurrent sessions: requires DIIME_TEST_NODE_MODULES with native test packages. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import { pg } from './fixtures/hitos-native-db.mjs'
import { fileURLToPath } from 'node:url'
process.env.PGLITE_PATH = fileURLToPath(new URL('./fixtures/hitos-native-db.mjs', import.meta.url))
const {db,ids} = await import('./fixtures/hitos-db.mjs')
const config=db.connectionOptions
const connections=[]
const connect=async(role,actor)=>{const c=new pg.Client(config);connections.push(c);await c.connect();await c.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||'']);await c.query('set role '+role);return c}
const one=async(q,a)=>(await db.query(q,a)).rows[0]
try {
const plan=[40,60].map((n,i)=>({id:randomUUID(),titulo:'Fase '+i,descripcion:'',criterio_aceptacion:'Entregable',fecha_limite:'2027-04-01',importe_centimos:n*100}))
const request=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Concurrencia','Prueba','Madrid') returning id",[ids.client])).id
const offer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,3,'Prueba','hitos',$3,10,2,10,90) returning id",[request,ids.owner,JSON.stringify(plan)])).id
const c1=await connect('authenticated',ids.client),c2=await connect('authenticated',ids.client)
const accepted=await Promise.all([c1,c2].map(c=>c.query('select public.aceptar_oferta_y_crear_trabajo($1,$2,$3,null,1) value',[offer,request,ids.owner])))
const job=accepted[0].rows[0].value.trabajo.id
assert.equal(accepted[1].rows[0].value.trabajo.id,job)
assert.equal(accepted.filter(x=>x.rows[0].value.reutilizado).length,1)
await db.query("update public.trabajos set proveedor_stripe_account_id='acct_owner' where id=$1",[job])
const s1=await connect('service_role'),s2=await connect('service_role')
const prepared=await Promise.all([s1,s2].map(c=>c.query('select public.preparar_pago_hito($1,$2,$3) value',[job,plan[0].id,ids.client])))
assert.equal(prepared[0].rows[0].value.id,prepared[1].rows[0].value.id)
await db.query("update public.transacciones_escrow set estado='cancelado' where id=$1",[prepared[0].rows[0].value.id])
const race=await Promise.allSettled([s1.query('select public.preparar_pago_hito($1,$2,$3) value',[job,plan[0].id,ids.client]),c1.query("select public.proponer_plan_trabajo($1,'hitos',$2,1) value",[job,JSON.stringify(plan)])])
assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
assert.equal(race.filter(x=>x.status==='rejected').length,1)
console.log('Native PostgreSQL concurrent sessions: contract acceptance, checkout preparation and proposal-versus-checkout race passed')
} finally {
  await Promise.allSettled(connections.map(c=>c.end()))
  await db.close()
}
