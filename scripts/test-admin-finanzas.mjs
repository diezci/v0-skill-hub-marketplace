import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function cargar(file, dependencias = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: module.exports, module,
    require: nombre => { if (!(nombre in dependencias)) throw Error(`Dependencia no simulada: ${nombre}`); return dependencias[nombre] },
  }, { filename: file })
  return module.exports
}
const puro = cargar("lib/admin-finanzas.ts")
const servidor = cargar("lib/admin-finanzas-servidor.ts", { "server-only": {}, "@/lib/admin-finanzas": puro })
const fecha = Date.parse("2026-11-06T12:00:00Z")
const transaccion = (id, fee = 100, otros = {}) => ({ id, fee, amount: 6100, net: 6100 - fee, currency: "eur", type: "charge", created: 100, fee_details: [{ amount: fee, type: "stripe_fee", currency: "eur" }], ...otros })
const pago = (id = "1", otros = {}) => ({
  id, trabajo_id: `trabajo-${id}`, estado: "completado", monto: "61.00", retencion_plataforma: "12.00", comision_cliente: "10.00", comision_proveedor: "2.00",
  monto_reembolsado: "0.00", liquidacion_estado: "completada", liquidacion_error: null,
  stripe_charge_id: `ch_${id}`, stripe_payment_intent_id: `pi_${id}`, stripe_session_id: `cs_live_${id}`,
  stripe_refund_id: null, stripe_refund_status: null, stripe_disputa_id: null,
  fecha_liberacion: "2026-11-01T10:00:00Z", fecha_reembolso: null, created_at: "2026-10-01T10:00:00Z", trabajo: { titulo: `Trabajo ${id}` }, ...otros,
})
const cargo = (id = "1", otros = {}) => ({ id: `ch_${id}`, amount: 6100, amount_refunded: 0, livemode: true, paid: true, captured: true, currency: "eur", payment_intent: `pi_${id}`, metadata: { escrow_id: id }, balance_transaction: `txn_${id}`, disputed: false, ...otros })

function entorno(opciones = {}) {
  const llamadas = [], config = { esAdmin: true, ...opciones }
  let tiempo = fecha
  const consulta = tabla => {
    let rango = [0, 499]
    const q = {
      select: campos => { llamadas.push([tabla, "select", campos]); return q },
      eq: (campo, valor) => { llamadas.push([tabla, "eq", campo, valor]); return q },
      lte: (campo, valor) => { llamadas.push([tabla, "lte", campo, valor]); return q },
      order: () => q, range: (desde, hasta) => { rango = [desde, hasta]; llamadas.push([tabla, "range", desde, hasta]); return q },
      maybeSingle: async () => ({ data: { es_admin: config.esAdmin, cuenta_eliminada: config.eliminada }, error: config.errorPerfil ? {} : null }),
      then: (resolve, reject) => Promise.resolve({ data: (tabla === "transacciones_escrow" ? config.pagos ?? [pago()] : config.disputas ?? []).slice(rango[0], rango[1] + 1), error: config.errorLibro ? {} : null }).then(resolve, reject),
    }
    return q
  }
  let authLecturas = 0
  const sesion = {
    auth: { getUser: async () => { llamadas.push(["auth"]); authLecturas++; return { data: { user: config.sinUsuario || (config.revocar && authLecturas > 1) ? null : { id: "admin" } }, error: config.errorAuth ? {} : null } } },
    from: tabla => { assert.equal(tabla, "profiles"); return consulta(tabla) },
  }
  const stripe = {
    balance: { retrieve: async () => { llamadas.push(["stripe", "balance"]); if (config.errorModo) throw Error("sk_live_SECRETO"); return { livemode: config.modo ?? true } } },
    balanceTransactions: { list: async (params, request) => {
      llamadas.push(["stripe", "balanceTransactions", params]); assert.equal(params.limit, 100); assert.equal(params.created.lte, Math.floor(tiempo / 1000)); assert.equal(request.timeout, 15_000)
      if (config.errorGastos) throw Error("sk_live_SECRETO req_privada")
      if (config.paginasStripe) return config.paginasStripe[params.starting_after ? 1 : 0]
      const movimientos = config.movimientos ?? [transaccion("txn_1")]
      const desde = params.starting_after ? movimientos.findIndex(m => m.id === params.starting_after) + 1 : 0
      return { data: movimientos.slice(desde, desde + 100), has_more: desde + 100 < movimientos.length }
    } },
    charges: { retrieve: async id => { llamadas.push(["stripe", "charges", id]); if (config.errorCargo) throw Error("No such charge"); return config.cargos?.[id] ?? cargo(id.replace("ch_", ""), config.cargo) } },
    paymentIntents: { retrieve: async id => { llamadas.push(["stripe", "paymentIntents", id]); return { id, status: "succeeded", livemode: config.modo ?? true, latest_charge: `ch_${id.replace("pi_", "")}`, ...config.intent } } },
    refunds: { retrieve: async id => { llamadas.push(["stripe", "refunds", id]); return { id, status: "succeeded", amount: 2200, currency: "eur", charge: "ch_1", payment_intent: "pi_1", ...config.refund } } },
    disputes: { retrieve: async id => { llamadas.push(["stripe", "disputes", id]); return { id, status: "lost", livemode: true, amount: 6100, currency: "eur", charge: "ch_1", ...config.disputa } } },
  }
  const deps = {
    sesion: async () => config.sinSesion ? null : sesion,
    admin: () => { llamadas.push(["admin"]); return { from: consulta } },
    stripe: () => { llamadas.push(["clienteStripe"]); return stripe },
    ahora: () => tiempo,
  }
  const leer = servidor.crearServicioFinanzasAdmin(deps)
  return { leer, llamadas, config, avanzar: ms => { tiempo += ms }, deps }
}
let casos = 0
async function prueba(nombre, fn) { await fn(); casos++; console.log(`PASS ${nombre}`) }

await prueba("Céntimos exactos y rechazo de importes inválidos", () => {
  assert.equal(puro.centimos("123.45"), 12345); assert.equal(puro.centimos(0.1 + 0.2), 30)
  for (const value of [null, undefined, "", "NaN", "1.001", 0.001, Infinity]) assert.equal(puro.centimos(value), null)
  assert.equal(puro.comisionLiquidada(pago("1", { retencion_plataforma: null })), 1200)
  assert.equal(puro.comisionLiquidada(pago("1", { retencion_plataforma: null, comision_cliente: null })), null)
})
await prueba("Gastos: application_fee excluida, principales excluidos, signos y standalone", () => {
  assert.equal(puro.gastoMovimiento(transaccion("a", 260, { fee_details: [{ amount: 200, type: "application_fee", currency: "eur" }, { amount: 60, type: "stripe_fee", currency: "eur" }] })), 60)
  for (const type of ["refund", "transfer", "payout", "topup", "application_fee", "application_fee_refund"]) assert.equal(puro.gastoMovimiento(transaccion("a", 0, { type, amount: -9000, net: -9000, fee_details: [] })), 0)
  assert.equal(puro.gastoMovimiento(transaccion("a", -30, { type: "refund", amount: -9000, net: -8970 })), -30)
  for (const type of ["stripe_fee", "stripe_fx_fee", "tax_fee"]) assert.equal(puro.gastoMovimiento(transaccion("a", 5, { type, amount: -25, net: -30 })), 30)
  assert.equal(puro.gastoMovimiento(transaccion("a", 0, { type: "stripe_fee", amount: 45, net: 45, fee_details: [] })), -45)
})
await prueba("Crédito concedido de 100 EUR y consumo de 3 EUR: coste 3, nunca beneficio +97", async () => {
  const e = entorno({ movimientos: [transaccion("txn_1", 0), transaccion("grant", 0, { type: "fee_credit_funding", amount: 10000, net: 10000, fee_details: [], balance_type: "fee_credits" }), transaccion("use", 0, { type: "stripe_fee", amount: -300, net: -300, fee_details: [], balance_type: "fee_credits" })] })
  const r = (await e.leer()).data
  assert.equal(r.gastosStripeCentimos, 300); assert.equal(r.netoCentimos, 900); assert.ok(r.avisos.some(a => a.includes("créditos")))
})
await prueba("Sin sesión, admin, perfil válido o cuenta activa no accede a Stripe ni service role", async () => {
  for (const config of [{ sinSesion: true }, { sinUsuario: true }, { esAdmin: false }, { errorPerfil: true }, { eliminada: true }, { errorAuth: true }]) {
    const e = entorno(config); assert.ok((await e.leer()).error)
    assert.equal(e.llamadas.filter(x => ["stripe", "admin", "clienteStripe"].includes(x[0])).length, 0)
  }
})
await prueba("Auth antes de cache, revocación tras lecturas y TTL de 60 segundos", async () => {
  const e = entorno(); await e.leer(); await e.leer()
  assert.equal(e.llamadas.filter(x => x[0] === "admin").length, 1)
  assert.equal(e.llamadas.filter(x => x[0] === "auth").length, 3)
  e.config.esAdmin = false; assert.ok((await e.leer()).error)
  assert.equal(e.llamadas.filter(x => x[0] === "admin").length, 1)
  e.config.esAdmin = true; e.avanzar(60_001); await e.leer()
  assert.equal(e.llamadas.filter(x => x[0] === "admin").length, 2)
  assert.ok((await entorno({ revocar: true }).leer()).error)
})
await prueba("La acción usa el servicio autorizado y no inicializa clientes al importarse", async () => {
  const e = entorno()
  const servicio = { crearServicioFinanzasAdmin: deps => servidor.crearServicioFinanzasAdmin({ ...deps, ahora: e.deps.ahora }) }
  const accion = cargar("app/actions/admin-finanzas.ts", { "@/lib/supabase/server": { createClient: e.deps.sesion }, "@/lib/supabase/admin": { createAdminClient: e.deps.admin }, "@/lib/stripe": { stripe: e.deps.stripe() }, "@/lib/admin-finanzas-servidor": servicio })
  e.llamadas.length = 0; e.config.esAdmin = false
  assert.ok((await accion.obtenerResumenFinanzasAdmin()).error); assert.equal(e.llamadas.filter(x => x[0] === "admin" || x[0] === "stripe").length, 0)
})
await prueba("Histórico paginado completo: >500 pagos y disputas, >100 movimientos", async () => {
  const pagos = Array.from({ length: 500 }, (_, i) => pago(`p${i}`, { estado: "pendiente" })); pagos.push(pago())
  const disputas = Array.from({ length: 501 }, (_, i) => ({ id: `d${i}`, escrow_id: `otro${i}` }))
  const movimientos = [transaccion("txn_1", 1), ...Array.from({ length: 150 }, (_, i) => transaccion(`t${i}`, 1))]
  const e = entorno({ pagos, disputas, movimientos }); const r = (await e.leer()).data
  assert.equal(r.brutoCentimos, 1200); assert.equal(r.gastosStripeCentimos, 151); assert.equal(r.pagosLiquidados, 1)
  for (const tabla of ["transacciones_escrow", "disputas"]) assert.equal(e.llamadas.filter(x => x[0] === tabla && x[1] === "range").length, 2)
  assert.ok(e.llamadas.some(x => x[0] === "disputas" && x[1] === "eq" && x[2] === "origen" && x[3] === "stripe"))
})
await prueba("Balance deduplica IDs entre páginas y rechaza cursor repetido", async () => {
  const a = transaccion("txn_1"), b = transaccion("txn_2", 20)
  const e = entorno({ paginasStripe: [{ data: [a], has_more: true }, { data: [a, b], has_more: false }] })
  assert.equal((await e.leer()).data.gastosStripeCentimos, 120)
  const roto = entorno({ paginasStripe: [{ data: [a], has_more: true }, { data: [a], has_more: true }] })
  assert.equal((await roto.leer()).data.gastosStripeCentimos, null)
})
await prueba("Modo, cuenta/cargo, PI, captura, metadata y monto deben corresponder", async () => {
  for (const config of [{ errorCargo: true }, { cargo: { livemode: false } }, { cargo: { payment_intent: "pi_otro" } }, { cargo: { captured: false } }, { cargo: { paid: false } }, { cargo: { amount: 1 } }, { cargo: { metadata: { escrow_id: "otro" } } }, { pagos: [pago("1", { stripe_charge_id: null, stripe_payment_intent_id: null })] }]) {
    const r = (await entorno(config).leer()).data; assert.equal(r.brutoCentimos, null); assert.equal(r.netoCentimos, null); assert.equal(r.pendientesConciliar, 1)
  }
  const test = entorno({ modo: false, pagos: [pago("1", { stripe_charge_id: null, stripe_session_id: "cs_test_1" })], cargo: { livemode: false } })
  const r = (await test.leer()).data; assert.equal(r.modoReal, false); assert.equal(r.brutoCentimos, 1200); assert.ok(test.llamadas.some(x => x[1] === "paymentIntents"))
})
await prueba("Reembolso parcial: sólo succeeded real, importe/referencias y total conciliados", async () => {
  const config = { pagos: [pago("1", { estado: "reembolsado", monto_reembolsado: 22, stripe_refund_id: "re_1", stripe_refund_status: "succeeded" })], cargo: { amount_refunded: 2200 } }
  assert.equal((await entorno(config).leer()).data.brutoCentimos, 1200)
  for (const extra of [{ refund: { status: "pending" } }, { refund: { status: "failed" } }, { refund: { amount: 2100 } }, { refund: { charge: "ch_otro" } }, { cargo: { amount_refunded: 2300 } }]) assert.equal((await entorno({ ...config, ...extra }).leer()).data.netoCentimos, null)
  assert.equal((await entorno({ ...config, pagos: [pago("1", { ...config.pagos[0], stripe_refund_status: "pending" })] }).leer()).data.brutoCentimos, null)
  assert.equal((await entorno({ cargo: { amount_refunded: 100 } }).leer()).data.brutoCentimos, null)
})
await prueba("Contracargo perdido íntegro conciliado elimina comisión; parcial/abierto queda pendiente", async () => {
  const d = { id: "d1", escrow_id: "1", stripe_disputa_id: "du_1", stripe_disputa_estado: "lost", stripe_disputa_importe: 6100, stripe_disputa_moneda: "eur", contracargo_conciliacion: { estado: "completada", resultado: "lost" } }
  const config = { disputas: [d], cargo: { disputed: true } }
  const r = (await entorno(config).leer()).data; assert.equal(r.brutoCentimos, 0); assert.equal(r.netoCentimos, -100); assert.equal(r.pagosLiquidados, 1)
  for (const extra of [{ disputa: { amount: 100 } }, { disputa: { status: "under_review" } }, { disputas: [{ ...d, contracargo_conciliacion: null }] }, { disputas: [] }]) assert.equal((await entorno({ ...config, ...extra }).leer()).data.brutoCentimos, null)
  assert.equal((await entorno({ ...config, disputa: { status: "won" }, disputas: [{ ...d, stripe_disputa_estado: "won", contracargo_conciliacion: { estado: "completada", resultado: "won" } }] }).leer()).data.brutoCentimos, 1200)
})
await prueba("Errores y datos ausentes son null, nunca cero ni información privada", async () => {
  for (const config of [{ errorGastos: true }, { movimientos: [] }, { cargo: { balance_transaction: null } }, { movimientos: [transaccion("txn_1", 100, { net: 999 })] }]) {
    const e = entorno(config); const r = await e.leer(); assert.equal(r.data.gastosStripeCentimos, null); assert.equal(r.data.netoCentimos, null)
    assert.ok(!JSON.stringify(r).includes("SECRETO")); await e.leer(); assert.equal(e.llamadas.filter(x => x[0] === "admin").length, 2)
  }
  const fallo = await entorno({ errorLibro: true }).leer(); assert.equal(fallo.data.brutoCentimos, null); assert.equal(fallo.data.gastosStripeCentimos, 100)
  assert.ok((await entorno({ errorModo: true }).leer()).error)
  assert.equal((await entorno({ pagos: [pago("1", { liquidacion_estado: "error", liquidacion_error: "fallo" })] }).leer()).data.brutoCentimos, null)
})
await prueba("Otras monedas no se suman y se identifican", async () => {
  const r = (await entorno({ movimientos: [transaccion("txn_1"), transaccion("usd", 800, { currency: "usd" })] }).leer()).data
  assert.equal(r.gastosStripeCentimos, 100); assert.equal(r.otrasMonedas.join(), "USD")
  const extranjero = (await entorno({ cargo: { currency: "usd" } }).leer()).data
  assert.equal(extranjero.brutoCentimos, null); assert.equal(extranjero.otrasMonedas.join(), "USD")
  const fx = (await entorno({ movimientos: [transaccion("txn_1", 100, { currency: "usd", fee_details: [{ amount: 100, type: "stripe_fee", currency: "usd" }] })] }).leer()).data
  assert.equal(fx.brutoCentimos, 1200); assert.equal(fx.gastosStripeCentimos, null); assert.equal(fx.netoCentimos, null); assert.equal(fx.otrasMonedas.join(), "USD")
})
await prueba("Últimos cobros sólo verificados, ordenados y máximo seis; ledger duplicado no total falso", async () => {
  const pagos = Array.from({ length: 8 }, (_, i) => pago(String(i), { fecha_liberacion: `2026-11-0${i + 1}T10:00:00Z` }))
  const r = (await entorno({ pagos, movimientos: pagos.map(p => transaccion(`txn_${p.id}`)) }).leer()).data
  assert.equal(r.ultimosCobros.length, 6); assert.equal(r.ultimosCobros[0].id, "7"); assert.equal(r.brutoCentimos, 9600)
  const repetido = (await entorno({ pagos: [pago(), pago("2", { stripe_charge_id: "ch_1", stripe_payment_intent_id: "pi_1" })], cargo: { metadata: {} } }).leer()).data
  assert.equal(repetido.brutoCentimos, null); assert.equal(repetido.netoCentimos, null)
})
console.log(`${casos} casos de finanzas verificados sin red, escrituras ni cobros.`)
