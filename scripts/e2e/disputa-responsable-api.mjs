// HTTP actions + authenticated RPC against the isolated local database only.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext(), checks=[]
assert.ok(['localhost','127.0.0.1'].includes(new URL(c.env.DATABASE_URL).hostname))
const {Client}=createRequire(process.cwd()+'/.build/workflow-db/package.json')('pg')
const db=new Client({connectionString:c.env.DATABASE_URL});await db.connect()
const ad=await c.client('AD'),ad2=await c.client('AD2'),cp=await c.client('CP2')
// /publicar is a redirect: consume the actual form page after a dev restart.
await (await cp.request('/')).text()
const prior=(await db.query('select es_admin from profiles where id=$1',[c.credentials.users.AD2.id])).rows[0].es_admin
const test=async(name,fn)=>{const details=await fn();checks.push({name,pass:true,details});console.log('PASS',name)}
try {
  // Synthetic administrator restored in finally, even when an assertion fails.
  await db.query('update profiles set es_admin=true where id=$1',[c.credentials.users.AD2.id])
  const job=await c.createJob({label:'responsable disputa atomicidad'})
  c.ok(await c.call('CP2','solicitarCancelacion',[job.trabajoId,'Mediación local para comprobar la asignación administrativa sin pago.']),'solicitar')
  const revision=(await c.row('trabajos',job.trabajoId)).cancelacion_revision
  c.ok(await c.call('PP','responderCancelacion',[job.trabajoId,false,'Mantengo las condiciones acordadas.',[],revision]),'rechazar')
  const opened=await c.admin.from('disputas').select('id').eq('trabajo_id',job.trabajoId).single()
  assert.ok(!opened.error)
  const id=opened.data.id
  assert.ok(id)
  await db.query("update disputas set created_at=now()-interval '30 hours' where id=$1",[id])
  const before=await c.row('disputas',id)
  const rpc=(client,assign)=>client.supabase.rpc('diime_asignarme_disputa',{p_disputa:id,p_asignar:assign})
  await test('No-admin denegado por acción HTTP y RPC directa',async()=>{
    assert.ok((await c.call('CP2','asignarmeDisputa',[id,true])).error)
    assert.equal((await rpc(cp,true)).error?.code,'42501')
    assert.deepEqual(await c.row('disputas',id),before)
  })
  let winner,loser
  await test('Dos administradores simultáneos producen una sola asignación',async()=>{
    const rs=await Promise.all([rpc(ad,true),rpc(ad2,true)])
    assert.equal(rs.filter(r=>!r.error).length,1)
    const i=rs.findIndex(r=>!r.error);winner=[ad,ad2][i];loser=[ad,ad2][1-i]
    const d=await c.row('disputas',id);assert.equal(d.estado,'en_revision');assert.equal(d.created_at,before.created_at)
    assert.ok([c.credentials.users.AD.id,c.credentials.users.AD2.id].includes(d.responsable_id))
    const count=(await db.query('select count(*)::int n from diime_private.disputa_asignaciones where disputa_id=$1',[id])).rows[0].n
    assert.equal(count,1);return {responsable:d.responsable_id,auditEntries:count,createdAt:d.created_at}
  })
  await test('Repetición idempotente y liberación ajena rechazada',async()=>{
    const before=await c.row('disputas',id);assert.ok(!(await rpc(winner,true)).error)
    assert.deepEqual(await c.row('disputas',id),before);assert.ok((await rpc(loser,false)).error)
    assert.equal((await db.query('select count(*)::int n from diime_private.disputa_asignaciones where disputa_id=$1',[id])).rows[0].n,1)
  })
  await test('Liberar y reasignar mantiene antigüedad y alerta SLA con responsable',async()=>{
    assert.ok(!(await rpc(winner,false)).error);assert.equal((await c.row('disputas',id)).responsable_id,null)
    c.ok(await c.call('AD2','asignarmeDisputa',[id,true]),'asignación HTTP')
    const d=await c.row('disputas',id);assert.equal(d.responsable_id,c.credentials.users.AD2.id);assert.equal(d.created_at,before.created_at)
    const op=await c.call('AD','obtenerEstadoOperativo',[]);assert.equal(op.ok,true,op.error)
    const row=op.data.detalle.disputasVencidas.find(r=>r.id===id);assert.ok(row);assert.equal(row.responsable_id,d.responsable_id);assert.equal(row.responsable.es_admin,true)
    return {id,owner:row.responsable_id,agePreserved:true}
  })
  await test('Administrador revocado no actúa y su expediente puede recuperarse',async()=>{
    await db.query('update profiles set es_admin=false where id=$1',[c.credentials.users.AD2.id])
    assert.equal((await rpc(ad2,false)).error?.code,'42501')
    c.ok(await c.call('AD','asignarmeDisputa',[id,true]),'recuperar asignación')
    assert.equal((await c.row('disputas',id)).responsable_id,c.credentials.users.AD.id)
  })
  await test('Resolver sin pago elimina SLA y bloquea nuevas asignaciones',async()=>{
    c.ok(await c.call('AD','resolverDisputa',[{disputa_id:id,resolucion:'cliente',nota:'Mediación local sin pago para cerrar la comprobación de asignación.'}]),'resolver')
    const d=await c.row('disputas',id);assert.equal(d.estado,'resuelta');assert.ok((await rpc(ad,true)).error)
    const op=await c.call('AD','obtenerEstadoOperativo',[]);assert.equal(op.ok,true,op.error);assert.ok(!op.data.detalle.disputasVencidas.some(r=>r.id===id))
    assert.equal((await c.admin.from('transacciones_escrow').select('id').eq('trabajo_id',job.trabajoId)).data.length,0)
  })
  fs.writeFileSync(c.dir+'/disputa-responsable-api-proof.json',JSON.stringify({at:new Date(),environment:'isolated local HTTP + Supabase; zero payments',job,disputeId:id,checks},null,2))
} finally {await db.query('update profiles set es_admin=$1 where id=$2',[prior,c.credentials.users.AD2.id]);await db.end()}
console.log(`${checks.length} checks passed; AD2 permission restored`)
