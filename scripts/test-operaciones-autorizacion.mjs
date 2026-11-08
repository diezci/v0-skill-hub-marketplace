// Server-action authorization with an isolated query double; no network or emails.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function setup({ authenticated = true, administrator = true, deleted = false, profileError = null, configured = true, total = 4, failure = null, revokedAfterRead = false, roleRevokedAfterRead = false, changedUserAfterRead = false, authError = null } = {}) {
  const calls = []
  let privilegedRead = false
  const query = {
    select() { calls.push("profile.select"); return query },
    eq(key, value) { assert.equal(key, "id"); assert.equal(value, "admin-fixture"); return query },
    async maybeSingle() { calls.push("profile.read"); return { data: { es_admin: administrator && !(privilegedRead && roleRevokedAfterRead), cuenta_eliminada: deleted }, error: profileError } },
  }
  const session = {
    auth: { async getUser() { calls.push("auth.getUser"); return { data: { user: authenticated && !(privilegedRead && revokedAfterRead) ? { id: privilegedRead && changedUserAfterRead ? "other-user" : "admin-fixture" } : null }, error: authError } } },
    from(table) { assert.equal(table, "profiles"); return query },
  }
  const deps = {
    "@/lib/i18n-servidor": { textoServidor: async text => text },
    "next/cache": { revalidatePath() { throw Error("Read-only count must not revalidate") } },
    "@/lib/supabase/server": { async createClient() { calls.push("session.create"); return configured ? session : null } },
    "@/lib/supabase/admin": { createAdminClient() { throw Error("This action delegates its privileged query to the count helper") } },
    "@/lib/operaciones": {
      CATEGORIAS_OPERATIVAS: ["solicitudesSinOferta"],
      async obtenerConteoSolicitudesSinOferta() { calls.push("privileged.count"); if (failure) throw new Error(failure); return total },
      async obtenerIndicadoresOperativos() { calls.push("privileged.indicators"); if (failure) throw new Error(failure); privilegedRead = true; return { generadoAt: "2026-11-08T12:00:00Z", controles: { solicitudesSinOferta: { total, error: null } } } },
      async obtenerResumenOperativo() { calls.push("privileged.summary"); if (failure) throw new Error(failure); privilegedRead = true; return { generadoAt: "2026-11-08T12:00:00Z", detalle: {}, totales: {}, total } },
      async obtenerDetalleOperativo(categoria, desde) { assert.equal(categoria, "solicitudesSinOferta"); assert.equal(desde, 0); calls.push("privileged.page"); if (failure) throw new Error(failure); privilegedRead = true; return { filas: [], total } },
    },
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/actions/operaciones.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Error, require: name => deps[name] })
  return { calls, run: () => exports.obtenerConteoDemandasSinOferta(), indicadores: () => exports.obtenerIndicadoresOperativosAdmin(), estado: () => exports.obtenerEstadoOperativo(), pagina: () => exports.obtenerPaginaOperativa("solicitudesSinOferta", 0), paginaInvalida: () => exports.obtenerPaginaOperativa("profiles", 0) }
}

let checks = 0
async function check(name, fn) { await fn(); checks++; console.log("PASS", name) }
await check("Una sesión no autenticada no llega a la consulta privilegiada", async () => {
  const fixture = setup({ authenticated: false }), result = await fixture.run()
  assert.equal(result.ok, false)
  assert.match(result.error, /No autenticado/)
  assert.deepEqual(fixture.calls, ["session.create", "auth.getUser"])
})
await check("Un usuario sin privilegios de administrador no puede contar demandas", async () => {
  const fixture = setup({ administrator: false }), result = await fixture.run()
  assert.equal(result.ok, false)
  assert.match(result.error, /No tienes permiso/)
  assert.equal(fixture.calls.includes("privileged.count"), false)
})
await check("Configuración de sesión ausente no publica un cero ficticio", async () => {
  const fixture = setup({ configured: false }), result = await fixture.run()
  assert.equal(result.ok, false)
  assert.equal(result.total, undefined)
  assert.deepEqual(fixture.calls, ["session.create"])
})
await check("El administrador recibe el conteo solo después de autenticar y verificar su perfil", async () => {
  const fixture = setup({ total: 17 }), result = await fixture.run()
  assert.equal(result.ok, true)
  assert.equal(result.total, 17)
  assert.deepEqual(fixture.calls, ["session.create", "auth.getUser", "profile.select", "profile.read", "privileged.count"])
})
await check("Un cero confirmado se conserva como resultado válido", async () => {
  const result = await setup({ total: 0 }).run()
  assert.equal(result.ok, true)
  assert.equal(result.total, 0)
})
await check("Un fallo de consulta vuelve como error, nunca como conteo cero", async () => {
  const result = await setup({ failure: "Error sintético de consulta" }).run()
  assert.equal(result.ok, false)
  assert.match(result.error, /No se pudo comprobar/)
  assert.equal(result.total, undefined)
})
await check("Una cuenta eliminada o un fallo de perfil no accede al conteo privilegiado", async () => {
  for (const options of [{ deleted: true }, { profileError: new Error("Perfil no disponible") }]) {
    const fixture = setup(options), result = await fixture.run()
    assert.equal(result.ok, false)
    assert.equal(fixture.calls.includes("privileged.count"), false)
  }
})
await check("Indicadores: toda autorización termina antes de consultar datos privilegiados", async () => {
  for (const options of [{ authenticated: false }, { administrator: false }, { configured: false }, { deleted: true }, { profileError: {} }, { authError: {} }]) {
    const fixture = setup(options), result = await fixture.indicadores()
    assert.equal(result.ok, false); assert.equal(fixture.calls.includes("privileged.indicators"), false)
  }
  const fixture = setup({ total: 31 }), result = await fixture.indicadores()
  assert.equal(result.ok, true); assert.equal(result.data.controles.solicitudesSinOferta.total, 31)
  assert.deepEqual(fixture.calls, ["session.create", "auth.getUser", "profile.select", "profile.read", "privileged.indicators", "session.create", "auth.getUser", "profile.select", "profile.read"])
})
await check("Indicadores: revocar sesión, cambiar usuario o retirar rol durante la consulta impide divulgarla", async () => {
  for (const options of [{ revokedAfterRead: true }, { changedUserAfterRead: true }, { roleRevokedAfterRead: true }]) {
    const fixture = setup(options), result = await fixture.indicadores()
    assert.equal(result.ok, false); assert.equal(result.data, undefined); assert.equal(fixture.calls.includes("privileged.indicators"), true)
  }
})
await check("Indicadores: un error interno no revela SQL, correo ni credenciales", async () => {
  const result = await setup({ failure: "SELECT private email=privado@example.com sk_live_SECRET" }).indicadores()
  assert.equal(result.ok, false); assert.equal(result.data, undefined); assert.equal(result.error, "No se pudo obtener el estado operativo.")
})
await check("Resumen y páginas exigen autorización fresca y códigos de denegación después de leer", async () => {
  for (const accion of ["estado", "pagina", "indicadores"]) {
    for (const [options, codigo] of [[{ revokedAfterRead: true }, "NO_AUTENTICADO"], [{ changedUserAfterRead: true }, "NO_AUTENTICADO"], [{ roleRevokedAfterRead: true }, "SIN_PERMISO"]]) {
      const fixture = setup(options), result = await fixture[accion]()
      assert.equal(result.ok, false); assert.equal(result.codigo, codigo); assert.equal(result.data, undefined)
      assert.equal(fixture.calls.filter(c => c === "auth.getUser").length, 2)
    }
    const permitido = setup(), result = await permitido[accion]()
    assert.equal(result.ok, true); assert.equal(permitido.calls.filter(c => c === "profile.read").length, 2)
  }
})
await check("Resumen y páginas distinguen denegación de acceso de fallo de datos sin filtrar errores", async () => {
  for (const accion of ["estado", "pagina", "indicadores"]) {
    for (const [options, codigo] of [[{ authenticated: false }, "NO_AUTENTICADO"], [{ authError: {} }, "NO_AUTENTICADO"], [{ administrator: false }, "SIN_PERMISO"], [{ deleted: true }, "SIN_PERMISO"], [{ profileError: {} }, "SIN_PERMISO"]]) {
      const fixture = setup(options), result = await fixture[accion]()
      assert.equal(result.ok, false); assert.equal(result.codigo, codigo); assert.equal(fixture.calls.some(c => c.startsWith("privileged.")), false)
    }
    const result = await setup({ failure: "SELECT email=privado@example.com sk_SECRET" })[accion]()
    assert.equal(result.ok, false); assert.equal(result.codigo, undefined); assert.equal(result.data, undefined); assert.equal(result.error, "No se pudo obtener el estado operativo.")
  }
  const fixture = setup(), result = await fixture.paginaInvalida()
  assert.equal(result.ok, false); assert.match(result.error, /Paginación/); assert.equal(fixture.calls.some(c => c.startsWith("privileged.")), false)
})
console.log(`${checks} operational authorization regressions passed`)
