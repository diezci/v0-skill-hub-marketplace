import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const ESCROW = "00000000-0000-4000-8000-000000000022"
const ADMIN = "00000000-0000-4000-8000-000000000099"
const NO_CORRESPONDE = "El reembolso no corresponde al pago registrado. Revisa el caso en Stripe."
function cargar(file, dependencias = {}) {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: module.exports, module, URL, URLSearchParams,
    require: nombre => { if (!(nombre in dependencias)) throw Error(`Dependencia sin simular: ${nombre}`); return dependencias[nombre] },
  }, { filename: file })
  return module.exports
}
const contexto = cargar("lib/notificaciones-contexto.ts")

function entorno(opciones = {}) {
  const llamadas = [], escrituras = []
  const pago = {
    id: ESCROW, stripe_refund_id: "re_known", stripe_payment_intent_id: "pi_known",
    stripe_charge_id: "ch_known", stripe_session_id: "cs_live_known", ...opciones.pago,
  }
  const refund = {
    id: "re_known", payment_intent: "pi_known", charge: "ch_known", status: "succeeded",
    amount: 2200, currency: "eur", created: 1789732800,
    destination_details: { type: "card", card: { reference: "741852963000001", reference_status: "available", reference_type: "acquirer_reference_number" } },
    ...opciones.refund,
  }
  const consulta = (tipo, data, error) => {
    const q = {
      select: campos => { llamadas.push([tipo, "select", campos]); return q },
      eq: (campo, valor) => { llamadas.push([tipo, "eq", campo, valor]); return q },
      maybeSingle: async () => ({ data, error }),
    }
    for (const metodo of ["insert", "upsert", "update", "delete", "rpc"]) q[metodo] = () => { escrituras.push([tipo, metodo]); throw Error("No se permiten escrituras") }
    return q
  }
  const sesion = {
    auth: { getUser: async () => { llamadas.push(["auth", "getUser"]); return { data: { user: opciones.sinUsuario ? null : { id: ADMIN } } } } },
    from: tabla => {
      assert.equal(tabla, "profiles")
      llamadas.push(["session", "from", tabla])
      return consulta("perfil", { es_admin: opciones.esAdmin ?? true }, opciones.errorPerfil ? { message: "privado" } : null)
    },
  }
  const admin = {
    from: tabla => {
      assert.equal(tabla, "transacciones_escrow")
      llamadas.push(["admin", "from", tabla])
      return consulta("pago", opciones.sinPago ? null : pago, opciones.errorPago ? { message: "detalle privado postgres" } : null)
    },
  }
  const stripe = new Proxy({}, { get: (_target, recurso) => new Proxy({}, { get: (_target, metodo) => async (...args) => {
    llamadas.push(["stripe", recurso, metodo, ...args])
    if (recurso !== "refunds" || metodo !== "retrieve") { escrituras.push(["stripe", recurso, metodo]); throw Error("Sólo lectura del reembolso existente") }
    if (opciones.falloStripe) throw Object.assign(Error("sk_live_SECRET request=req_private cuenta=acct_private"), { requestId: "req_private", raw: { token: "sk_live_SECRET" } })
    return refund
  } }) })
  const { comprobarReembolsoAdmin } = cargar("app/actions/admin-pagos.ts", {
    "@/lib/supabase/server": { createClient: async () => { llamadas.push(["factory", "session"]); return opciones.sinCliente ? null : sesion } },
    "@/lib/supabase/admin": { createAdminClient: () => { llamadas.push(["factory", "admin"]); return opciones.sinAdminClient ? null : admin } },
    "@/lib/stripe": { stripe }, "@/lib/i18n-servidor": { textoServidor: async texto => texto },
    "@/lib/notificaciones-contexto": contexto,
  })
  return { llamadas, escrituras, comprobar: async (...ids) => {
    const id = ids.length ? ids[0] : ESCROW
    const resultado = await comprobarReembolsoAdmin(id)
    assert.equal(escrituras.length, 0, "Consulting must never create/refund/update anything")
    return resultado
  } }
}
const contar = (e, tipo, operacion) => e.llamadas.filter(c => c[0] === tipo && (!operacion || c[1] === operacion)).length
let casos = 0
async function prueba(nombre, fn) { await fn(); casos++; console.log(`PASS ${nombre}`) }

await prueba("Un ID inválido no inicia sesión privilegiada ni consulta Stripe", async () => {
  for (const id of ["", "re_known", "not-a-uuid", null, undefined, 22, `${ESCROW};drop table profiles`]) {
    const e = entorno()
    assert.equal((await e.comprobar(id)).error, "Pago no válido")
    assert.equal(e.llamadas.length, 0)
  }
})
await prueba("Sin sesión, sin rol admin o con error de permisos no se crea cliente admin", async () => {
  for (const opciones of [{ sinUsuario: true }, { esAdmin: false }, { errorPerfil: true }, { sinCliente: true }]) {
    const e = entorno(opciones)
    assert.ok((await e.comprobar()).error)
    assert.equal(contar(e, "factory", "admin"), 0)
    assert.equal(contar(e, "stripe"), 0)
  }
})
await prueba("La autorización lee el perfil del actor antes de consultar el pago exacto", async () => {
  const e = entorno()
  assert.ok((await e.comprobar()).data)
  const filtroPerfil = e.llamadas.findIndex(c => c[0] === "perfil" && c[1] === "eq")
  const creaAdmin = e.llamadas.findIndex(c => c[0] === "factory" && c[1] === "admin")
  assert.ok(filtroPerfil < creaAdmin)
  assert.deepEqual(e.llamadas[filtroPerfil], ["perfil", "eq", "id", ADMIN])
  assert.deepEqual(e.llamadas.find(c => c[0] === "pago" && c[1] === "eq"), ["pago", "eq", "id", ESCROW])
})
await prueba("Pago ausente, error DB o refund no registrado nunca se consulta en Stripe", async () => {
  for (const opciones of [{ sinAdminClient: true }, { sinPago: true }, { errorPago: true }, { pago: { stripe_refund_id: null } }]) {
    const e = entorno(opciones)
    const r = await e.comprobar()
    assert.ok(r.error)
    assert.equal(contar(e, "stripe"), 0)
    assert.ok(!JSON.stringify(r).includes("postgres"))
  }
})
await prueba("Sólo se recupera el refund guardado: no listados ni movimientos financieros", async () => {
  const e = entorno()
  await e.comprobar()
  assert.deepEqual(e.llamadas.filter(c => c[0] === "stripe"), [["stripe", "refunds", "retrieve", "re_known"]])
})
await prueba("Los IDs PaymentIntent y Charge expandidos o string se cotejan igual", async () => {
  for (const payment_intent of ["pi_known", { id: "pi_known" }]) {
    for (const charge of ["ch_known", { id: "ch_known" }]) {
      const e = entorno({ refund: { payment_intent, charge } })
      assert.equal((await e.comprobar()).data.id, "re_known")
    }
  }
})
await prueba("Un PI, cargo o refund diferente se rechaza sin exponer datos de otro pago", async () => {
  for (const refund of [{ payment_intent: "pi_other" }, { payment_intent: { id: "pi_other" } }, { charge: "ch_other" }, { charge: { id: "ch_other" } }, { id: "re_other" }, { payment_intent: null }]) {
    const e = entorno({ refund })
    const r = await e.comprobar()
    assert.equal(r.error, NO_CORRESPONDE)
    assert.equal(r.data, undefined)
  }
})
await prueba("Se permite cotejar por el identificador disponible y se rechaza sin ninguno", async () => {
  for (const pago of [{ stripe_payment_intent_id: null }, { stripe_charge_id: null }]) {
    assert.ok((await entorno({ pago }).comprobar()).data)
  }
  const e = entorno({ pago: { stripe_charge_id: null, stripe_payment_intent_id: null } })
  assert.equal((await e.comprobar()).error, NO_CORRESPONDE)
  assert.equal(contar(e, "stripe"), 0)
})
await prueba("El reembolso de 22 EUR devuelve estado y ARN sin recalcular ni mover dinero", async () => {
  const { data } = await entorno().comprobar()
  assert.deepEqual(JSON.parse(JSON.stringify(data)), {
    id: "re_known", estado: "succeeded", importe: 22, moneda: "eur",
    creadoEn: new Date(1789732800 * 1000).toISOString(), referencia: "741852963000001",
    referenciaEstado: "available", referenciaTipo: "acquirer_reference_number", fallo: null, modoReal: true,
  })
})
await prueba("Estado pendiente o fallo y ausencia de referencia se preservan", async () => {
  for (const status of ["pending", "requires_action", "failed", "canceled"]) {
    const { data } = await entorno({ refund: { status, failure_reason: "lost_or_stolen_card", destination_details: null } }).comprobar()
    assert.equal(data.estado, status)
    assert.equal(data.fallo, "lost_or_stolen_card")
    assert.equal(data.referencia, null)
    assert.equal(data.referenciaTipo, null)
    assert.equal(data.referenciaEstado, null)
  }
})
await prueba("Modo live/test requiere un identificador conocido; lo desconocido queda sin afirmar", async () => {
  for (const [stripe_session_id, expected] of [["cs_live_known", true], ["cs_test_known", false], [null, null], ["legacy_unknown", null]]) {
    assert.equal((await entorno({ pago: { stripe_session_id } }).comprobar()).data.modoReal, expected)
  }
})
await prueba("Los fallos Stripe salen sanitizados sin claves, request IDs ni cuentas", async () => {
  const e = entorno({ falloStripe: true })
  const r = await e.comprobar()
  assert.equal(r.error, "No se pudo consultar el reembolso en Stripe. Vuelve a intentarlo.")
  assert.equal(r.data, undefined)
  assert.ok(!/SECRET|req_private|acct_private|sk_live/.test(JSON.stringify(r)))
})

console.log(`${casos} escenarios de consulta administrativa del reembolso verificados, sin red ni escrituras.`)
