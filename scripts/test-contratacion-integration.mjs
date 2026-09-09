// Integración contra PostgreSQL local real con las migraciones aplicadas.
// No admite servidores remotos ni usa credenciales del proyecto Supabase.
// WORKFLOW_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55439/workflow_contracts \
// node scripts/test-contratacion-integration.mjs
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
const url = new URL(process.env.WORKFLOW_TEST_DATABASE_URL || "postgresql://postgres:workflow-local-only@127.0.0.1:55439/workflow_contracts")
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/workflow_")) {
  throw new Error("Las pruebas solo se ejecutan en una base workflow_ local")
}
const { default: pg } = await import(process.env.WORKFLOW_TEST_PG_MODULE || "../.build/workflow-db/node_modules/pg/lib/index.js")
const options = { connectionString: url.href, statement_timeout: 10000 }
const db = new pg.Client(options)
await db.connect()
await db.query("select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)")
const passed = []
async function test(name, run) {
  await run()
  passed.push(name)
  console.log(`OK ${name}`)
}
async function actor(user, sql, args = [], role = "authenticated") {
  const c = new pg.Client(options)
  await c.connect()
  try {
    await c.query("begin")
    await c.query(`set local role ${role === "anon" ? "anon" : "authenticated"}`)
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role })])
    const result = await c.query(sql, args)
    await c.query("commit")
    return result
  } catch (e) {
    await c.query("rollback")
    throw e
  } finally { await c.end() }
}
async function denied(user, sql, args = []) {
  try {
    const r = await actor(user, sql, args)
    assert.equal(r.rowCount, 0, "La escritura prohibida debe fallar o afectar cero filas")
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error
    assert.ok(["42501", "55000", "23514", "22023", "23505"].includes(error.code), `${error.code}: ${error.message}`)
  }
}
const client = randomUUID(), pro = randomUUID(), companyPro = randomUUID(), coworker = randomUUID(), stranger = randomUUID()
const company = randomUUID()
async function request(owner = client) {
  const id = randomUUID()
  await db.query("insert into solicitudes(id,cliente_id,titulo,descripcion,ubicacion,estado) values($1,$2,'Prueba de contratación local','Reparación de una puerta interior con materiales','Madrid','abierta')", [id, owner])
  return id
}
async function offer(demand, professional = pro, units = "horas", hours = 8) {
  const id = randomUUID()
  await db.query("insert into ofertas(id,solicitud_id,profesional_id,precio,tiempo_estimado,unidad_tiempo,descripcion,estado) values($1,$2,$3,100,$4,$5,'Servicio local de reparación','pendiente')", [id, demand, professional, hours, units])
  return id
}
const acceptSQL = "select public.aceptar_oferta_y_crear_trabajo($1,$2,$3,null) as resultado"
async function accept(user, id, demand, professional) {
  return (await actor(user, acceptSQL, [id, demand, professional])).rows[0].resultado
}

try {
  for (const id of [client, pro, companyPro, coworker, stranger]) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `${id}@example.test`])
    await db.query("insert into profiles(id,email,nombre) values($1,$2,'Prueba local')", [id, `${id}@example.test`])
  }
  for (const id of [pro, companyPro, coworker]) await db.query("insert into profesionales(id,titulo) values($1,'Profesional de prueba')", [id])
  await db.query("insert into empresas(id,nombre,cif,propietario_id) values($1,'Empresa de prueba',$2,$3)", [company, randomUUID(), companyPro])
  await db.query("update profiles set empresa_id=$1 where id=any($2::uuid[])", [company, [companyPro, coworker]])

  const demand = await request(), first = await offer(demand), second = await offer(demand, companyPro)
  const otherDemand = await request(), other = await offer(otherDemand)
  await test("Solo el cliente propietario puede aceptar; el proveedor y terceros no", async () => {
    await assert.rejects(accept(pro, first, demand, pro), { code: "42501" })
    await assert.rejects(accept(stranger, first, demand, pro), { code: "42501" })
  })
  await test("La RPC no está expuesta a anónimos", async () => {
    await assert.rejects(actor(null, acceptSQL, [first, demand, pro], "anon"), { code: "42501" })
  })
  await test("No permite cruzar oferta, demanda o proveedor enviados desde el navegador", async () => {
    await assert.rejects(accept(client, other, demand, pro), { code: "22023" })
    await assert.rejects(accept(client, first, demand, companyPro), { code: "22023" })
  })
  let job
  await test("Ocho aceptaciones simultáneas crean un solo contrato y devuelven el mismo ID", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => accept(client, first, demand, pro)))
    assert.equal(new Set(results.map(x => x.trabajo.id)).size, 1)
    assert.equal(results.filter(x => !x.reutilizado).length, 1)
    job = results[0].trabajo
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1", [demand])).rows[0].n, 1)
    assert.equal((await db.query("select estado from ofertas where id=$1", [first])).rows[0].estado, "aceptada")
  })
  await test("Una oferta de ocho horas termina en ocho horas, no en ocho días", async () => {
    const delta = new Date(job.fecha_estimada_fin) - new Date(job.created_at)
    assert.ok(Math.abs(delta - 8 * 60 * 60 * 1000) < 1000)
  })
  await test("Otra oferta no sustituye el contrato pendiente ni cancela sus pagos", async () => {
    await assert.rejects(accept(client, second, demand, companyPro), { code: "55000" })
    assert.equal((await db.query("select estado from trabajos where id=$1", [job.id])).rows[0].estado, "pendiente_pago")
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1", [demand])).rows[0].n, 1)
  })
  await test("Dos ofertas distintas aceptadas simultáneamente generan un único ganador", async () => {
    const d = await request(), a = await offer(d), b = await offer(d, companyPro)
    const r = await Promise.allSettled([accept(client,a,d,pro),accept(client,b,d,companyPro)])
    assert.equal(r.filter(x=>x.status==="fulfilled").length,1)
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1",[d])).rows[0].n,1)
  })
  await test("La API directa no permite crear contratos ni falsear aceptación o relaciones", async () => {
    await denied(client,"insert into trabajos(cliente_id,profesional_id,solicitud_id,oferta_id,titulo,precio_acordado,estado) values($1,$2,$3,$4,'Falso',100,'pendiente_pago')",[client,pro,otherDemand,other])
    await denied(client,"update ofertas set estado='aceptada' where id=$1",[other])
    await denied(pro,"update ofertas set estado='aceptada' where id=$1",[other])
    await denied(pro,"update ofertas set solicitud_id=$1 where id=$2",[demand,other])
    await denied(client,"update ofertas set precio=1 where id=$1",[other])
    await denied(client,"update solicitudes set cliente_id=$1 where id=$2",[stranger,otherDemand])
    await denied(client,"update solicitudes set estado='completada' where id=$1",[demand])
  })
  await test("El cliente conserva el rechazo legítimo de ofertas pendientes", async () => {
    const r = await actor(client,"update ofertas set estado='rechazada' where id=$1 returning estado",[other])
    assert.equal(r.rows[0].estado,"rechazada")
  })
  await test("Participantes no pueden cambiar precio, IDs, completar, cancelar ni entregar antes de pagar", async () => {
    for (const user of [client,pro]) {
      await denied(user,"update trabajos set precio_acordado=1 where id=$1",[job.id])
      await denied(user,"update trabajos set profesional_id=$1 where id=$2",[companyPro,job.id])
      await denied(user,"update trabajos set estado='completado' where id=$1",[job.id])
      await denied(user,"update trabajos set estado='cancelado' where id=$1",[job.id])
      await denied(user,"update trabajos set estado='entregado',progreso=100,fecha_entrega=now() where id=$1",[job.id])
    }
    await denied(pro,"update trabajos set progreso=50 where id=$1",[job.id])
  })
  await test("Cancelación: solicitante puede editar/retirar y la otra parte no suplanta su respuesta", async () => {
    await actor(client,"update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$1,cancelacion_razon='Cambio de necesidad' where id=$2",[client,job.id])
    await denied(pro,"update trabajos set cancelacion_razon='Texto alterado' where id=$1",[job.id])
    await actor(client,"update trabajos set cancelacion_razon='Necesidad actualizada' where id=$1",[job.id])
    await denied(client,"update trabajos set cancelacion_estado='rechazada' where id=$1",[job.id])
    await actor(client,"update trabajos set cancelacion_estado=null,cancelacion_solicitada_por=null,cancelacion_razon=null,cancelacion_adjuntos_solicitante='{}',cancelacion_respuesta_razon=null,cancelacion_adjuntos_respuesta='{}' where id=$1",[job.id])
  })
  await db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,monto_bruto_proveedor,estado,fecha_retencion) values($1,$2,$3,110,100,10,10,10,90,100,'retenido',now())",[job.id,client,pro])
  await db.query("update trabajos set estado='en_progreso' where id=$1",[job.id])
  await test("Trabajo pagado: el proveedor puede avanzar y entregar; el cliente no", async () => {
    // Estado legítimo tras retirar una disputa que nació de una cancelación
    // rechazada: la cancelación ya no está pendiente y el servicio continúa.
    await db.query("update trabajos set cancelacion_estado='rechazada' where id=$1",[job.id])
    await denied(client,"update trabajos set progreso=25 where id=$1",[job.id])
    const r = await actor(pro,"update trabajos set progreso=25 where id=$1 returning progreso",[job.id])
    assert.equal(r.rows[0].progreso,25)
    const delivered = await actor(pro,"update trabajos set estado='entregado',progreso=100,fecha_entrega='2000-01-01' where id=$1 returning fecha_entrega",[job.id])
    assert.ok(new Date(delivered.rows[0].fecha_entrega).getFullYear() > 2020)
    await denied(pro,"update trabajos set estado='completado' where id=$1",[job.id])
  })
  await test("La planificación del calendario sigue disponible solo para el proveedor", async () => {
    await actor(pro,"update trabajos set horas_estimadas=12,horas_registradas=8,notas_privadas_proveedor='Pendiente revisión',prioridad='alta' where id=$1",[job.id])
    await denied(client,"update trabajos set horas_registradas=999 where id=$1",[job.id])
  })
  await test("Proveedor a nombre de empresa contrata con su identidad; otro miembro no obtiene permisos", async () => {
    const d = await request(), o = await offer(d,companyPro)
    const r = await accept(client,o,d,companyPro)
    assert.equal(r.trabajo.profesional_id,companyPro)
    await denied(coworker,"update trabajos set cancelacion_estado='pendiente',cancelacion_solicitada_por=$1,cancelacion_razon='Intento de compañero' where id=$2",[coworker,r.trabajo.id])
    await denied(coworker,"update ofertas set precio=1 where id=$1",[o])
  })
  await test("Una oferta cerrada no puede aceptarse y no se crea trabajo residual", async () => {
    await assert.rejects(accept(client,other,otherDemand,pro),{code:"55000"})
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1",[otherDemand])).rows[0].n,0)
  })
  await test("Una tarifa desconocida bloquea contratar hasta que el proveedor confirma sus gastos", async () => {
    const d = await request(), o = await offer(d)
    // Simula un registro histórico sin evidencia de tarifa. Solo datos locales.
    await db.query("begin")
    try {
      await db.query("alter table ofertas disable trigger trg_fijar_comision_proveedor_oferta")
      await db.query("update ofertas set comision_proveedor_porcentaje=null,comision_proveedor_minima=null,comision_proveedor_prevista=null,pago_neto_proveedor_previsto=null where id=$1",[o])
      await db.query("alter table ofertas enable trigger trg_fijar_comision_proveedor_oferta")
      await db.query("commit")
    } catch (e) { await db.query("rollback"); throw e }
    await assert.rejects(accept(client,o,d,pro),{code:"55000"})
    await actor(pro,"update ofertas set comision_proveedor_porcentaje=10,comision_proveedor_minima=2,comision_proveedor_prevista=10,pago_neto_proveedor_previsto=90 where id=$1",[o])
    assert.equal((await accept(client,o,d,pro)).trabajo.estado,"pendiente_pago")
  })
  await test("Duplicados históricos se conservan y bloquean una nueva aceptación", async () => {
    const d = await request(), o = await offer(d)
    const first = await accept(client,o,d,pro)
    await db.query("begin")
    try {
      // Reproduce datos anteriores a la protección sin modificar otras bases.
      await db.query("alter table trabajos disable trigger trg_validar_nuevo_contrato")
      await db.query("insert into trabajos(cliente_id,profesional_id,solicitud_id,oferta_id,titulo,precio_acordado,estado,contratacion_version) values($1,$2,$3,$4,'Duplicado histórico local',100,'pendiente_pago',null)",[client,pro,d,o])
      await db.query("alter table trabajos enable trigger trg_validar_nuevo_contrato")
      await db.query("commit")
    } catch (e) { await db.query("rollback"); throw e }
    await assert.rejects(accept(client,o,d,pro),{code:"55000"})
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1",[d])).rows[0].n,2)
    assert.ok((await db.query("select id from trabajos where id=$1",[first.trabajo.id])).rowCount)
  })
  await test("La baja directa por RPC queda bloqueada con contratos o dinero pendiente", async () => {
    await assert.rejects(actor(client,"select public.eliminar_mi_cuenta()"),{code:"55000"})
    await assert.rejects(actor(pro,"select public.eliminar_mi_cuenta()"),{code:"55000"})
    assert.equal((await db.query("select cuenta_eliminada from profiles where id=$1",[client])).rows[0].cuenta_eliminada,null)
    const summary=(await actor(client,"select public.consecuencias_de_eliminar_mi_cuenta() as r")).rows[0].r
    assert.ok(summary.trabajos_pendientes>0)
    assert.ok(summary.pagos_pendientes>0)
    await assert.rejects(actor(client,"select private.eliminar_mi_cuenta_original()"),{code:"42501"})
  })
  await test("Baja sin obligaciones funciona y una cuenta eliminada no puede volver a contratar", async () => {
    const clean = randomUUID()
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[clean,`${clean}@example.test`])
    await db.query("insert into profiles(id,email,nombre) values($1,$2,'Cliente sin contratos')",[clean,`${clean}@example.test`])
    const d=await request(clean), o=await offer(d)
    await actor(clean,"select public.eliminar_mi_cuenta()")
    assert.ok((await db.query("select cuenta_eliminada from profiles where id=$1",[clean])).rows[0].cuenta_eliminada)
    await denied(clean,"update profiles set cuenta_eliminada=null where id=$1",[clean])
    await assert.rejects(accept(clean,o,d,pro),{code:"55000"})
    await denied(clean,"insert into solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Reabrir','Intento tras baja','Madrid')",[clean])
  })
  await test("Baja y aceptación simultáneas: solo una gana, sin contrato con una cuenta dada de baja", async () => {
    const clean = randomUUID()
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[clean,`${clean}@example.test`])
    await db.query("insert into profiles(id,email,nombre) values($1,$2,'Carrera local de baja')",[clean,`${clean}@example.test`])
    const d=await request(clean), o=await offer(d)
    const results=await Promise.allSettled([actor(clean,"select public.eliminar_mi_cuenta()"),accept(clean,o,d,pro)])
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1)
    const p=(await db.query("select cuenta_eliminada from profiles where id=$1",[clean])).rows[0]
    const jobs=(await db.query("select count(*)::int n from trabajos where cliente_id=$1",[clean])).rows[0].n
    assert.ok(p.cuenta_eliminada ? jobs===0 : jobs===1)
  })
  await test("Reparación conserva el contrato pagado y solo cierra su duplicado técnico sin intentos", async () => {
    async function fixture(withAttempt) {
      const d=await request(),o=await offer(d),j=(await accept(client,o,d,pro)).trabajo.id
      await db.query("update trabajos set estado='completado' where id=$1",[j])
      await db.query("update solicitudes set estado='completada' where id=$1",[d])
      const e=(await db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,monto_bruto_proveedor,estado,liquidacion_estado,stripe_payment_intent_id,fecha_retencion,fecha_liberacion) values($1,$2,$3,110,100,10,10,10,90,100,'completado','completada',$4,now(),now()) returning id",[j,client,pro,`pi_local_${randomUUID()}`])).rows[0].id
      const duplicate=randomUUID()
      await db.query("begin")
      try {
        await db.query("alter table trabajos disable trigger trg_validar_nuevo_contrato")
        await db.query("insert into trabajos(id,solicitud_id,oferta_id,cliente_id,profesional_id,titulo,descripcion,ubicacion,precio_acordado,estado,contratacion_version) select $1,solicitud_id,oferta_id,cliente_id,profesional_id,titulo,descripcion,ubicacion,precio_acordado,'pendiente_pago',null from trabajos where id=$2",[duplicate,j])
        await db.query("alter table trabajos enable trigger trg_validar_nuevo_contrato")
        await db.query("commit")
      }catch(error){await db.query("rollback");throw error}
      if(withAttempt) await db.query("insert into transacciones_escrow(trabajo_id,cliente_id,profesional_id,monto,monto_base,comision_cliente,comision_proveedor,comision_proveedor_original,pago_neto_proveedor,estado) values($1,$2,$3,110,100,10,10,10,90,'cancelado')",[duplicate,client,pro])
      return {j,e,d,o,duplicate}
    }
    const safe=await fixture(false),withAttempt=await fixture(true)
    const original=(await db.query("select to_jsonb(t) t,to_jsonb(e) e,to_jsonb(s) s,to_jsonb(o) o from trabajos t join transacciones_escrow e on e.id=$2 join solicitudes s on s.id=t.solicitud_id join ofertas o on o.id=t.oferta_id where t.id=$1",[safe.j,safe.e])).rows[0]
    await db.query(await readFile(new URL("../supabase/migrations/20260909193457_cerrar_duplicados_tecnicos_sin_pago.sql",import.meta.url),"utf8"))
    assert.equal((await db.query("select estado from trabajos where id=$1",[safe.duplicate])).rows[0].estado,"cancelado")
    assert.equal((await db.query("select estado from trabajos where id=$1",[withAttempt.duplicate])).rows[0].estado,"pendiente_pago")
    const current=(await db.query("select to_jsonb(t) t,to_jsonb(e) e,to_jsonb(s) s,to_jsonb(o) o from trabajos t join transacciones_escrow e on e.id=$2 join solicitudes s on s.id=t.solicitud_id join ofertas o on o.id=t.oferta_id where t.id=$1",[safe.j,safe.e])).rows[0]
    assert.deepEqual(current,original)
    await db.query(await readFile(new URL("../supabase/migrations/20260909193457_cerrar_duplicados_tecnicos_sin_pago.sql",import.meta.url),"utf8"))
    assert.equal((await db.query("select count(*)::int n from trabajos where solicitud_id=$1",[safe.d])).rows[0].n,2)
  })
  const result = { database: url.pathname.slice(1), passed: passed.length, tests: passed, generatedAt: new Date().toISOString() }
  if (process.env.WORKFLOW_TEST_OUTPUT) await writeFile(process.env.WORKFLOW_TEST_OUTPUT, JSON.stringify(result,null,2))
  console.log(JSON.stringify({passed: passed.length, database: result.database}))
} finally { await db.end() }
