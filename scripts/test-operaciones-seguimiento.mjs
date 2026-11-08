// Deterministic reporting tests: read-only doubles, no Stripe, Resend or network.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"
import { createClient } from "@supabase/supabase-js"

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const HORA = 3_600_000, DIA = 24 * HORA
const fecha = desplazamiento => new Date(NOW + desplazamiento).toISOString()
class FechaFija extends Date { static now() { return NOW } }
function cargar(archivo, deps = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(archivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date: FechaFija, console, process: { env: {} }, require: nombre => {
    if (!(nombre in deps)) throw Error(`Dependencia sin simular: ${nombre}`)
    return deps[nombre]
  } })
  return exports
}
const catalogo = cargar("lib/operaciones-catalogo.ts")
const plazos = cargar("lib/plazos-workflow.ts", { "server-only": {}, "@/lib/supabase/admin": {}, "@/lib/flujo-pagos": {} })
const trabajo = (id, extra = {}) => ({ id, titulo: id, estado: "en_progreso", created_at: fecha(-30 * DIA), updated_at: fecha(-DIA), cancelacion_estado: null, cancelacion_aceptada_por: null, ...extra })
const disputa = (id, extra = {}) => ({ id, estado: "abierta", origen: "stripe", stripe_disputa_estado: "needs_response", stripe_disputa_plazo: fecha(48 * HORA), created_at: fecha(-25 * HORA), contracargo_conciliacion: null, ...extra })
function datosBase() {
  return {
    trabajos: [
      trabajo("pago_15d", { estado: "pendiente_pago", created_at: fecha(-15 * DIA) }),
      trabajo("pago_antes", { estado: "pendiente_pago", created_at: fecha(-15 * DIA + 1) }),
      trabajo("pago_reciente", { estado: "pendiente_pago", created_at: fecha(-DIA) }),
      trabajo("pago_cancelado", { estado: "cancelado" }),
      trabajo("entrega_7d", { estado: "entregado", fecha_entrega: fecha(-7 * DIA) }),
      trabajo("entrega_antes", { estado: "entregado", fecha_entrega: fecha(-7 * DIA + 1) }),
      trabajo("entrega_completada", { estado: "completado", fecha_entrega: fecha(-10 * DIA) }),
      trabajo("entrega_sin_fecha", { estado: "entregado", fecha_entrega: null }),
      trabajo("cancelacion_activa", { cancelacion_estado: "pendiente" }),
      trabajo("cancelacion_sin_pago", { estado: "pendiente_pago", created_at: fecha(-DIA), cancelacion_estado: "pendiente" }),
      trabajo("cancelacion_aceptada", { cancelacion_estado: "pendiente", cancelacion_aceptada_por: "actor" }),
      trabajo("cancelacion_rechazada", { cancelacion_estado: "rechazada" }),
      ...["completado", "cancelado", "rechazado", "entregado", "en_disputa"].map(estado => trabajo(`cancelacion_${estado}`, { estado, cancelacion_estado: "pendiente" })),
    ],
    incidencias: [
      { id: "incidencia_24h", estado: "abierta", prioridad: "media", created_at: fecha(-24 * HORA) },
      { id: "incidencia_revision", estado: "en_revision", prioridad: "critica", created_at: fecha(-25 * HORA) },
      { id: "incidencia_antes", estado: "abierta", prioridad: "baja", created_at: fecha(-24 * HORA + 1) },
      { id: "incidencia_cerrada", estado: "cerrada", prioridad: "critica", created_at: fecha(-3 * DIA) },
      { id: "incidencia_resuelta", estado: "resuelta", prioridad: "critica", created_at: fecha(-3 * DIA) },
    ],
    solicitudes_verificacion_profesional: [
      { id: "verificacion_48h", estado: "pendiente", solicitada_at: fecha(-48 * HORA) },
      { id: "verificacion_revision", estado: "en_revision", solicitada_at: fecha(-49 * HORA) },
      { id: "verificacion_antes", estado: "pendiente", solicitada_at: fecha(-48 * HORA + 1) },
      ...["verificado", "no_aprobado", "retirada"].map(estado => ({ id: `verificacion_${estado}`, estado, solicitada_at: fecha(-7 * DIA) })),
    ],
    transacciones_escrow: [
      { id: "refund_pending", stripe_refund_id: "re_1", stripe_refund_status: "pending", updated_at: fecha(-2 * HORA) },
      { id: "refund_action", stripe_refund_id: "re_2", stripe_refund_status: "requires_action", updated_at: fecha(-HORA), estado: "completado" },
      { id: "refund_sin_id", stripe_refund_id: null, stripe_refund_status: "pending" },
      ...["succeeded", "failed", "canceled"].map(stripe_refund_status => ({ id: `refund_${stripe_refund_status}`, stripe_refund_id: "re_x", stripe_refund_status })),
      { id: "liquidacion_error", liquidacion_estado: "error", updated_at: fecha(-HORA) },
      { id: "liquidacion_15m", liquidacion_estado: "procesando", updated_at: fecha(-15 * 60_000) },
      { id: "liquidacion_atascada", liquidacion_estado: "procesando", updated_at: fecha(-15 * 60_000 - 1) },
    ],
    disputas: [
      disputa("banco_48h"), disputa("banco_vencido", { stripe_disputa_plazo: fecha(-HORA) }),
      disputa("banco_warning", { stripe_disputa_estado: "warning_needs_response", stripe_disputa_plazo: fecha(HORA) }),
      disputa("banco_despues", { stripe_disputa_plazo: fecha(48 * HORA + 1) }),
      disputa("banco_sin_plazo", { stripe_disputa_plazo: null }),
      disputa("banco_resuelto", { estado: "resuelta" }),
      disputa("banco_conciliado", { contracargo_conciliacion: { estado: "completada" } }),
      disputa("disputa_interna", { origen: "diime" }),
      ...["won", "lost", "under_review", "warning_closed"].map(stripe_disputa_estado => disputa(`banco_${stripe_disputa_estado}`, { stripe_disputa_estado })),
    ],
    eventos_operativos: [{ id: "evento", estado: "abierto", ultimo_evento_at: fecha(-HORA) }],
    stripe_eventos_webhook: [
      { id: "webhook_error", estado: "error", ultimo_intento_at: fecha(-HORA) },
      { id: "webhook_15m", estado: "procesando", ultimo_intento_at: fecha(-15 * 60_000) },
      { id: "webhook_atascado", estado: "procesando", ultimo_intento_at: fecha(-15 * 60_000 - 1) },
    ],
    solicitudes: [
      { id: "demanda_24h", estado: "abierta", created_at: fecha(-24 * HORA), total_ofertas: 999 },
      { id: "demanda_con_oferta", estado: "abierta", created_at: fecha(-48 * HORA), total_ofertas: 0 },
    ],
    ofertas: [{ id: "oferta", solicitud_id: "demanda_con_oferta", estado: "retirada" }],
  }
}
function entorno({ datos = datosBase(), fallo = -1, faltaConteo = -1, configurado = true, lanzar = false } = {}) {
  const consultas = []
  const admin = { from(tabla) {
    const indice = consultas.length, consulta = { tabla, head: false, filtros: [], orden: [], rango: null }
    consultas.push(consulta)
    let filas = [...(datos[tabla] ?? [])], desde = 0, hasta = Infinity
    function filtrar(nombre, campo, valor, predicado) { consulta.filtros.push([nombre, campo, valor]); filas = filas.filter(predicado); return q }
    const q = {
      select(campos, opciones) { assert.equal(opciones.count, "exact"); consulta.campos = campos; consulta.head = opciones.head === true; return q },
      eq(campo, valor) { return filtrar("eq", campo, valor, fila => fila[campo] === valor) },
      in(campo, valores) { return filtrar("in", campo, valores, fila => valores.includes(fila[campo])) },
      lt(campo, valor) { return filtrar("lt", campo, valor, fila => fila[campo] != null && fila[campo] < valor) },
      lte(campo, valor) { return filtrar("lte", campo, valor, fila => fila[campo] != null && fila[campo] <= valor) },
      is(campo, valor) { assert.equal(valor, null); return filtrar("is", campo, valor, fila => campo === "ofertas" ? !datos.ofertas.some(oferta => oferta.solicitud_id === fila.id) : fila[campo] == null) },
      not(campo, operador, valor) { assert.equal(operador, "is"); assert.equal(valor, null); return filtrar("not-is", campo, valor, fila => fila[campo] != null) },
      or(expresion) { assert.equal(expresion, "contracargo_conciliacion->>estado.is.null,contracargo_conciliacion->>estado.neq.completada"); return filtrar("or", expresion, null, fila => fila.contracargo_conciliacion?.estado !== "completada") },
      order(campo, opciones = {}) { consulta.orden.push([campo, opciones.ascending !== false]); return q },
      range(inicio, fin) { consulta.rango = [inicio, fin]; desde = inicio; hasta = fin + 1; return q },
      then(resolve, reject) {
        if (indice === fallo && lanzar) return Promise.reject(Error("detalle privado sk_SECRET")).then(resolve, reject)
        const ordenadas = [...filas].sort((a, b) => { for (const [campo, asc] of consulta.orden) { const comparacion = a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0; if (comparacion) return asc ? comparacion : -comparacion } return 0 })
        return Promise.resolve(indice === fallo ? { error: { message: "SQL privado usuario@example.com" }, data: null, count: null } : { data: consulta.head ? null : ordenadas.slice(desde, hasta), count: indice === faltaConteo ? null : filas.length, error: null }).then(resolve, reject)
      },
    }
    return q
  } }
  const api = cargar("lib/operaciones.ts", { "server-only": {}, resend: { Resend: class { constructor() { throw Error("No se permite enviar correo") } } }, "@/lib/supabase/admin": { createAdminClient: () => configurado ? admin : null }, "@/lib/operaciones-catalogo": catalogo, "@/lib/plazos-workflow": plazos })
  return { api, consultas, datos }
}
const esperados = {
  pagosSinCompletar: ["pago_15d"], entregasSinRevisar: ["entrega_7d"], cancelacionesPendientes: ["cancelacion_activa", "cancelacion_sin_pago"],
  incidenciasPendientes: ["incidencia_revision", "incidencia_24h"], verificacionesPendientes: ["verificacion_revision", "verificacion_48h"],
  reembolsosPendientes: ["refund_pending", "refund_action"], contracargosPorResponder: ["banco_vencido", "banco_warning", "banco_48h"],
}
let pruebas = 0
async function prueba(nombre, fn) { await fn(); pruebas++; console.log("PASS", nombre) }

for (const [categoria, ids] of Object.entries(esperados)) await prueba(`Estados, fechas límite y exclusiones: ${categoria}`, async () => {
  const { filas, total } = await entorno().api.obtenerDetalleOperativo(categoria, 0, NOW)
  assert.deepEqual(Array.from(filas, fila => fila.id), ids); assert.equal(total, ids.length)
})
await prueba("Los 15 controles HEAD coinciden con sus listados y nunca descargan filas", async () => {
  const e = entorno(), indicadores = await e.api.obtenerIndicadoresOperativos(NOW)
  assert.equal(Object.keys(indicadores.controles).length, 15)
  assert.deepEqual(Object.keys(indicadores.controles).sort(), Object.keys(catalogo.CONTROLES_OPERATIVOS).sort())
  assert.equal(indicadores.generadoAt, fecha(0)); assert.equal(e.consultas.length, 15)
  assert.ok(e.consultas.every(q => q.head && q.rango === null))
  for (const [categoria, resultado] of Object.entries(indicadores.controles)) {
    const detalle = await entorno().api.obtenerDetalleOperativo(categoria, 0, NOW)
    assert.equal(resultado.total, detalle.total); assert.equal(resultado.error, null)
  }
})
await prueba("Un milisegundo antes de 15d/7d/24h/48h aún no vence; los límites se incluyen", async () => {
  for (const [categoria, id] of [["pagosSinCompletar", "pago_15d"], ["entregasSinRevisar", "entrega_7d"], ["incidenciasPendientes", "incidencia_24h"], ["verificacionesPendientes", "verificacion_48h"]]) {
    const api = entorno().api
    assert.equal((await api.obtenerDetalleOperativo(categoria, 0, NOW - 1)).filas.some(f => f.id === id), false)
    assert.equal((await api.obtenerDetalleOperativo(categoria, 0, NOW)).filas.some(f => f.id === id), true)
  }
  assert.equal((await entorno().api.obtenerDetalleOperativo("contracargosPorResponder", 0, NOW - 1)).filas.some(f => f.id === "banco_48h"), false)
})
await prueba("Los umbrales existentes de 15 minutos conservan el criterio estrictamente mayor", async () => {
  assert.deepEqual(Array.from((await entorno().api.obtenerDetalleOperativo("webhooksAtascados", 0, NOW)).filas, f => f.id), ["webhook_atascado"])
  assert.deepEqual(Array.from((await entorno().api.obtenerDetalleOperativo("liquidacionesAtascadas", 0, NOW)).filas, f => f.id), ["liquidacion_atascada"])
})
await prueba("Fallo SQL, promesa rechazada y conteo ausente aíslan el control; nunca publican cero", async () => {
  for (const opciones of [{ fallo: 9 }, { fallo: 9, lanzar: true }, { faltaConteo: 9 }]) {
    const resultado = await entorno(opciones).api.obtenerIndicadoresOperativos(NOW)
    const valores = Object.values(resultado.controles)
    assert.equal(valores.filter(c => c.total === null).length, 1)
    assert.equal(valores.filter(c => c.error === null).length, 14)
    assert.equal(valores[9].error, "No se pudo consultar este control.")
    assert.ok(!JSON.stringify(resultado).includes("privado")); assert.ok(!JSON.stringify(resultado).includes("SECRET"))
  }
  const sinDb = await entorno({ configurado: false }).api.obtenerIndicadoresOperativos(NOW)
  assert.ok(Object.values(sinDb.controles).every(c => c.total === null && c.error))
})
await prueba("Un cero confirmado es válido; 63 filas conservan conteo exacto y paginación estable", async () => {
  const vacio = await entorno({ datos: {} }).api.obtenerIndicadoresOperativos(NOW)
  assert.ok(Object.values(vacio.controles).every(c => c.total === 0 && c.error === null))
  const datos = datosBase(); datos.trabajos = Array.from({ length: 63 }, (_, i) => trabajo(`p${String(62 - i).padStart(3, "0")}`, { estado: "entregado", fecha_entrega: fecha(-8 * DIA) }))
  const e = entorno({ datos }), todos = []
  assert.equal((await e.api.obtenerIndicadoresOperativos(NOW)).controles.entregasSinRevisar.total, 63)
  for (const desde of [0, 25, 50]) {
    const pagina = await e.api.obtenerDetalleOperativo("entregasSinRevisar", desde, NOW)
    assert.equal(pagina.total, 63); assert.equal(pagina.filas.length, desde === 50 ? 13 : 25); todos.push(...pagina.filas)
  }
  assert.deepEqual(todos.map(f => f.id), Array.from({ length: 63 }, (_, i) => `p${String(i).padStart(3, "0")}`))
})
await prueba("Sólo los ocho controles originales activan el resumen diario: ningún correo nuevo", async () => {
  const datos = { trabajos: [trabajo("entrega", { estado: "entregado", fecha_entrega: fecha(-8 * DIA) })] }
  const e = entorno({ datos }), resultado = await e.api.enviarAlertaOperativaDiaria()
  assert.equal(resultado.enviado, false); assert.equal(resultado.motivo, "sin_alertas"); assert.equal(resultado.resumen.total, 0)
  assert.equal(e.consultas.length, 8); assert.ok(!e.consultas.some(q => q.tabla === "trabajos"))
  assert.equal((await entorno({ datos }).api.obtenerResumenOperativo()).total, 1)
})
await prueba("SDK real: HEAD y GET conservan filtros y OR JSON, sin red ni escrituras", async () => {
  const peticiones = []
  const admin = createClient("https://operaciones.invalid", "test-key-not-a-credential", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), metodo = init.method
      assert.ok(["HEAD", "GET"].includes(metodo), "El seguimiento no escribe ni invoca RPC")
      assert.equal(url.hostname, "operaciones.invalid")
      peticiones.push({ url, metodo })
      return new Response(metodo === "HEAD" ? null : "[]", { status: 200, headers: { "content-range": "*/0", "content-type": "application/json" } })
    } },
  })
  const api = cargar("lib/operaciones.ts", { "server-only": {}, resend: { Resend: class { constructor() { throw Error("No correo") } } }, "@/lib/supabase/admin": { createAdminClient: () => admin }, "@/lib/operaciones-catalogo": catalogo, "@/lib/plazos-workflow": plazos })
  const indicadores = await api.obtenerIndicadoresOperativos(NOW)
  assert.equal(peticiones.length, 15); assert.ok(peticiones.every(p => p.metodo === "HEAD"))
  assert.ok(Object.values(indicadores.controles).every(c => c.total === 0 && c.error === null))
  const head = peticiones.find(p => p.url.searchParams.has("stripe_disputa_plazo"))
  assert.equal(head.url.searchParams.get("or"), "(contracargo_conciliacion->>estado.is.null,contracargo_conciliacion->>estado.neq.completada)")
  assert.equal(head.url.searchParams.get("estado"), "in.(abierta,en_revision)")
  assert.equal(head.url.searchParams.get("stripe_disputa_estado"), "in.(needs_response,warning_needs_response)")
  assert.deepEqual(head.url.searchParams.getAll("stripe_disputa_plazo"), ["not.is.null", `lte.${fecha(48 * HORA)}`])
  await api.obtenerDetalleOperativo("contracargosPorResponder", 0, NOW)
  const get = peticiones.at(-1); assert.equal(get.metodo, "GET")
  for (const [clave] of head.url.searchParams) assert.deepEqual(get.url.searchParams.getAll(clave), head.url.searchParams.getAll(clave))
  assert.equal(get.url.searchParams.get("limit"), "25"); assert.equal(get.url.searchParams.get("offset"), "0")
})
console.log(`${pruebas} controles de seguimiento verificados sin red ni modificaciones.`)
