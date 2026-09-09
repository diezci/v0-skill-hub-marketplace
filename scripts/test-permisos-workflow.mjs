import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function cargar(ruta, dependencias) {
  const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const modulo = { exports: {} }
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo,
    require(nombre) {
      if (nombre in dependencias) return dependencias[nombre]
      if (nombre === "@/lib/stripe-connect-identidad") return cargar("lib/stripe-connect-identidad.ts", {})
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
    console: { error() {}, info() {} }, process: { env: { NEXT_PUBLIC_SITE_URL: "https://test.diime.es" } },
    URLSearchParams, Date,
  }, { filename: ruta })
  return modulo.exports
}

function cliente({ user = { id: "yo", email: "yo@example.test" }, tablas = {}, rpc = { data: "empresa-1" } } = {}) {
  const llamadas = []
  const api = {
    llamadas,
    auth: {
      getUser: async () => ({ data: { user } }),
      updateUser: async (datos) => { llamadas.push(["metadata", datos]); return { error: null } },
    },
    rpc: async (...args) => { llamadas.push(["rpc", ...args]); return rpc },
    from(tabla) {
      const consulta = { tabla, operacion: "select" }
      const cadena = {
        select() { return cadena }, eq() { return cadena }, contains() { return cadena },
        insert(datos) { consulta.operacion = "insert"; llamadas.push(["insert", tabla, datos]); return cadena },
        update(datos) { consulta.operacion = "update"; llamadas.push(["update", tabla, datos]); return cadena },
        single() { return Promise.resolve({ data: tablas[tabla], error: null }) },
        maybeSingle() { return cadena.single() },
        then(resolve) { resolve({ data: tablas[tabla], error: null }) },
      }
      llamadas.push(["from", tabla])
      return cadena
    },
  }
  return api
}

// El escritor no es una acción expuesta y nunca vuelve al INSERT de usuario.
for (const [actor, destino, configurado, esperado] of [[null, "otro", true, false], ["yo", "yo", true, false], ["yo", "otro", false, false], ["yo", "otro", true, true]]) {
  const sesion = cliente({ user: actor ? { id: actor } : null })
  const admin = cliente()
  const escritor = cargar("lib/notificaciones.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => sesion },
    "@/lib/supabase/admin": { createAdminClient: () => configurado ? admin : null },
    "@/lib/push/enviar": { enviarPushAUsuario: async () => {} },
    "@/lib/emails/enviar": { enviarAvisoPorEmail: async () => {} },
  })
  await escritor.crearNotificacion({ usuarioId: destino, tipo: "prueba", titulo: "Prueba" })
  assert.equal(admin.llamadas.some(([op]) => op === "insert"), esperado)
  assert.equal(sesion.llamadas.some(([op]) => op === "insert"), false)
}

// La invitación de demanda nunca permite notificar por una demanda ajena.
for (const [propietario, estado, permitido] of [["otro", "abierta", false], ["yo", "cancelada", false], ["yo", "abierta", true]]) {
  const sesion = cliente({ tablas: {
    solicitudes: { id: "s1", cliente_id: propietario, estado, categorias: { nombre: "Limpieza" }, titulo: "Prueba", ubicacion: "Madrid" },
    profesionales: [{ id: "proveedor", provincias_cobertura: ["Madrid"] }],
  } })
  const admin = cliente()
  const acciones = cargar("app/actions/invitaciones.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/filtros-notificaciones": { encajaEnPresupuestoDeAvisos: () => true },
    "@/lib/utils": { formatearRangoPresupuesto: () => "100 €" },
    "@/lib/emails/enviar": { enviarAvisoPorEmail: async () => {} },
  })
  const resultado = await acciones.buscarYEnviarInvitaciones("s1")
  assert.equal(Boolean(resultado.success), permitido)
  assert.equal(admin.llamadas.some(([op]) => op === "insert"), permitido)
  assert.equal(sesion.llamadas.some(([op]) => op === "insert"), false)
}

// Registro de empresa: el actor siempre es la sesión; no se acepta un ID de
// usuario/empresa desde el formulario como autorización.
for (const autenticado of [false, true]) {
  const sesion = cliente({ user: autenticado ? { id: "yo" } : null })
  const acciones = cargar("app/actions/empresas.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion }, "next/cache": { revalidatePath() {} },
  })
  const resultado = await acciones.completarRegistroEmpresa({ tokenInvitacion: " token-validado-por-bd ", documentoPersonal: " DNI " })
  assert.equal(Boolean(resultado.data), autenticado)
  assert.equal(sesion.llamadas.some(([op]) => op === "rpc"), autenticado)
  if (autenticado) {
    const llamada = sesion.llamadas.find(([op]) => op === "rpc")
    assert.equal(llamada[1], "vincular_mi_empresa")
    assert.equal(llamada[2].p_token, "token-validado-por-bd")
    assert.equal(llamada[2].p_documento_personal, "DNI")
    assert.equal("empresa_id" in llamada[2], false)
    assert.equal("usuario_id" in llamada[2], false)
  }
}

// Connect: ni enlaces de acceso a una cuenta de otro proveedor ni escrituras
// de estados Stripe con la sesión del usuario.
for (const empresa of [null, "empresa-1"]) {
  const sesion = cliente({ tablas: {
    profiles: { id: "yo", nombre: "Ana", apellido: "Prueba", empresa_id: empresa },
    profesionales: { id: "yo", stripe_account_id: null },
  } })
  const admin = cliente({ tablas: { empresas: { nombre: "Empresa Prueba" } } })
  const creadas = []
  const cuenta = { id: "acct_yo", metadata: { diime_profesional_id: "yo" }, capabilities: {}, details_submitted: false }
  const acciones = cargar("app/actions/stripe-connect.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "next/cache": { revalidatePath() {} },
    "@/lib/stripe": { stripe: {
      accounts: { create: async (datos) => { creadas.push(datos); return cuenta }, retrieve: async () => cuenta },
      accountLinks: { create: async () => ({ url: "https://connect.stripe.test/onboarding" }) },
    } },
  })
  assert.ok((await acciones.crearEnlaceOnboardingStripe()).data)
  assert.equal(creadas[0].business_type, empresa ? "company" : "individual")
  assert.equal(creadas[0].business_profile.name, empresa ? "Empresa Prueba" : "Ana Prueba")
  assert.equal(admin.llamadas.filter(([op]) => op === "update").length, 1)
  assert.equal(sesion.llamadas.some(([op]) => op === "update"), false)
}
{
  const sesion = cliente({ tablas: { profiles: { id: "yo" }, profesionales: { id: "yo", stripe_account_id: "acct_otro" } } })
  let enlaces = 0
  const acciones = cargar("app/actions/stripe-connect.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion },
    "@/lib/supabase/admin": { createAdminClient: () => cliente() },
    "next/cache": { revalidatePath() {} },
    "@/lib/stripe": { stripe: { accounts: {
      retrieve: async () => ({ id: "acct_otro", metadata: { diime_profesional_id: "otro" } }),
      createLoginLink: async () => { enlaces++; return { url: "no" } },
    }, accountLinks: { create: async () => { enlaces++; return { url: "no" } } } } },
  })
  assert.ok((await acciones.crearEnlaceDashboardStripe()).error)
  assert.ok((await acciones.crearEnlaceOnboardingStripe()).error)
  assert.ok((await acciones.obtenerEstadoStripeConnect()).error)
  assert.equal(enlaces, 0)
}

// Una cuenta personal anterior no habilita nuevos cobros al representar empresa.
{
  const { errorIdentidadCuentaStripe } = cargar("lib/stripe-connect-identidad.ts", {})
  const metadata = { diime_profesional_id: "yo" }
  assert.ok(errorIdentidadCuentaStripe({ metadata, business_type: "individual", details_submitted: true }, { id: "yo", empresa_id: "empresa-1" }))
  assert.ok(errorIdentidadCuentaStripe({ metadata, business_type: "company", details_submitted: true }, { id: "yo", empresa_id: null }))
  assert.ok(errorIdentidadCuentaStripe({ metadata: { ...metadata, diime_empresa_id: "otra" }, business_type: "company" }, { id: "yo", empresa_id: "empresa-1" }))
  assert.equal(errorIdentidadCuentaStripe({ metadata: { ...metadata, diime_empresa_id: "empresa-1" }, business_type: "company" }, { id: "yo", empresa_id: "empresa-1" }), null)
}

// El alta sin sesión no intenta asociar empresas saltándose la confirmación.
{
  const sesion = cliente({ user: null })
  let enviada
  sesion.auth.signUp = async (datos) => { enviada = datos; return { data: { user: { id: "nuevo" }, session: null } } }
  const acciones = cargar("app/actions/auth.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion },
    "next/headers": {}, "next/navigation": {},
  })
  const resultado = await acciones.registrarUsuario({ email: "nueva@example.test", password: "dummy-test", nombre: "Ana", apellido: "Prueba", tipoEntidad: "empresa", documento: "B12345678", documentoPersonal: "12345678Z", nombreEmpresa: "Empresa", aceptaTerminos: true, confirmaMayoriaEdad: true })
  assert.equal(resultado.data.empresaPendiente, true)
  assert.equal(enviada.options.data.documento, "12345678Z")
  assert.equal(enviada.options.data.registro_empresa.cif, "B12345678")
  assert.equal(sesion.llamadas.length, 0)
}
// Una contratación pagada cierra también pujas abiertas con estados antiguos,
// conservando la ganadora y las ya retiradas/cerradas.
{
  const estados = ["pendiente", "enviada", "en_negociacion", "aceptada", "retirada", "rechazada"]
  const ofertas = estados.map((estado, i) => ({ id: `o${i}`, solicitud_id: "s1", profesional_id: `p${i}`, estado }))
  const admin = cliente()
  const cambios = []
  const origen = { from(tabla) {
    assert.equal(tabla, "ofertas")
    const filtros = []
    let update
    const query = {
      update(valores) { update = valores; return query },
      eq(campo, valor) { filtros.push((fila) => fila[campo] === valor); return query },
      in(campo, valores) { filtros.push((fila) => valores.includes(fila[campo])); return query },
      async select() {
        for (const fila of ofertas.filter((o) => filtros.every((f) => f(o)))) { Object.assign(fila, update); cambios.push(fila) }
        return { data: cambios }
      },
    }
    return query
  } }
  const helper = cargar("lib/ofertas-perdedoras.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/emails/enviar": { enviarAvisoPorEmail: async () => {} },
  })
  assert.equal((await helper.rechazarYNotificarOfertasPerdedoras(origen, { solicitudId: "s1" })).notificadas, 3)
  assert.deepEqual(ofertas.map((o) => o.estado), ["rechazada", "rechazada", "rechazada", "aceptada", "retirada", "rechazada"])
  assert.equal(admin.llamadas.find(([op]) => op === "insert")[2].length, 3)
}

// Una baja bloqueada conserva sesión y no mueve dinero ni cancela trabajos.
for (const bloqueada of [true, false]) {
  const sesion = cliente({ rpc: bloqueada ? { error: { message: "Resuelve tus contratos y pagos" } } : { error: null } })
  let cierres = 0
  sesion.auth.signOut = async () => { cierres++; return { error: null } }
  const acciones = cargar("app/actions/auth.ts", {
    "@/lib/supabase/server": { createClient: async () => sesion },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) }, "next/navigation": {},
  })
  const resultado = await acciones.eliminarMiCuenta()
  assert.equal(Boolean(resultado.error), bloqueada)
  assert.equal(cierres, bloqueada ? 0 : 1)
  assert.equal(sesion.llamadas.filter(([op]) => op === "rpc").length, 1)
  assert.equal(sesion.llamadas.some(([op]) => ["insert", "update", "from"].includes(op)), false)
}
console.log("Permisos workflow: 22 escenarios de autorización, cobros particular/empresa y alta pendiente verificados.")
