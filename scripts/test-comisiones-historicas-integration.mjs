// Destructive fixture setup is restricted to a local workflow_* database.
// Prepare the pre-052 schema with the workflow integration fixture first.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const url = new URL(process.env.DIIME_TEST_DATABASE_URL || 'postgresql://postgres:workflow-local-only@127.0.0.1:55439/workflow_history');
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || !url.pathname.startsWith('/workflow_')) throw new Error('Use a dedicated local workflow_* database');
const {default:pg}=await import('../.build/workflow-db/node_modules/pg/lib/index.js');
const db=new pg.Client({connectionString:url.href});await db.connect();
try {
  const cliente=randomUUID(), proveedor=randomUUID();
  for (const id of [cliente,proveedor]) {await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.test']);await db.query('insert into profiles(id,email,nombre) values($1,$2,$3)',[id,id+'@example.test','Prueba']);}
  await db.query("insert into profesionales(id,titulo) values($1,'Proveedor de prueba')",[proveedor]);
  const fixtures=[];
  async function oferta(nombre,created,fee=null,precio=500) {
    const solicitud=randomUUID(),id=randomUUID();
    await db.query("insert into solicitudes(id,cliente_id,titulo,descripcion,ubicacion) values($1,$2,'Prueba','Prueba','Madrid')",[solicitud,cliente]);
    await db.query("insert into ofertas(id,solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,created_at) values($1,$2,$3,$4,1,'Prueba',$5)",[id,solicitud,proveedor,precio,created]);
    if(fee!==null){const t=randomUUID();await db.query("insert into trabajos(id,solicitud_id,oferta_id,cliente_id,profesional_id,titulo,precio_acordado,estado) values($1,$2,$3,$4,$5,'Prueba',$6,'cancelado')",[t,solicitud,id,cliente,proveedor,precio]);await db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado) values($1,$2,$3,$4,$5,$6,$7,$7,$8,'cancelado')",[t,cliente,proveedor,precio+Math.max(precio*.1,2),precio,Math.max(precio*.1,2),fee,precio-fee]);}
    fixtures.push({nombre,id});return id;
  }
  const antiguo=await oferta('anterior sin pago','2026-09-01');
  const diez=await oferta('antigua con 10 acreditado','2026-09-01',50);
  const cinco=await oferta('posterior con 5 acreditado','2026-09-08',25);
  const desconocida=await oferta('posterior sin evidencia','2026-09-08');
  const incompatible=await oferta('histórico incompatible','2026-09-01',0);
  const minimo=await oferta('mínimo antiguo','2026-09-01',2,10);
  const original=JSON.stringify((await db.query('select * from transacciones_escrow order by id')).rows);
  await db.query(await fs.readFile('supabase/migrations/052_snapshot_comision_ofertas.sql','utf8'));
  async function get(id){return (await db.query('select * from ofertas where id=$1',[id])).rows[0];}
  assert.equal((await get(antiguo)).comision_proveedor_porcentaje,'5.00');
  assert.equal((await get(diez)).comision_proveedor_porcentaje,'10.00');
  assert.equal((await get(cinco)).comision_proveedor_porcentaje,'5.00');
  assert.equal((await get(desconocida)).comision_proveedor_porcentaje,null);
  assert.equal((await get(incompatible)).comision_proveedor_porcentaje,null);
  assert.equal((await get(minimo)).comision_proveedor_porcentaje,'5.00');
  assert.equal(JSON.stringify((await db.query('select * from transacciones_escrow order by id')).rows),original,'No se debe cambiar ningún importe ni fecha de escrow histórico');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:proveedor,role:'authenticated'})]);await db.query('set role authenticated');
  await db.query('update ofertas set comision_proveedor_porcentaje=0,comision_proveedor_minima=0,comision_proveedor_prevista=0 where id=$1',[antiguo]);
  assert.equal((await get(antiguo)).comision_proveedor_prevista,'25.00');
  await db.query("update ofertas set notas='Aclaración sin cambiar precio' where id=$1",[desconocida]);
  assert.equal((await get(desconocida)).comision_proveedor_porcentaje,null,'Editar texto no acepta una comisión desconocida');
  await db.query('update ofertas set comision_proveedor_porcentaje=10,comision_proveedor_minima=2 where id=$1',[desconocida]);
  assert.equal((await get(desconocida)).comision_proveedor_prevista,'50.00');
  await db.query('update ofertas set precio=600 where id=$1',[antiguo]);
  assert.equal((await get(antiguo)).comision_proveedor_prevista,'30.00');
  console.log('11 pruebas de comisiones históricas OK: evidencia 5/10, mínimos, desconocidas, aceptación explícita, inmutabilidad y edición.');
} finally {await db.end();}
