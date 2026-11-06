// Server-action authorization with an isolated query double; no network or emails.
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function setup({ authenticated = true, administrator = true, deleted = false, profileError = null, configured = true, total = 4, failure = null } = {}) {
  const calls = []
  const query = {
    select() { calls.push("profile.select"); return query },
    eq(key, value) { assert.equal(key, "id"); assert.equal(value, "admin-fixture"); return query },
    async maybeSingle() { calls.push("profile.read"); return { data: { es_admin: administrator, cuenta_eliminada: deleted }, error: profileError } },
  }
  const session = {
    auth: { async getUser() { calls.push("auth.getUser"); return { data: { user: authenticated ? { id: "admin-fixture" } : null } } } },
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
    },
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("app/actions/operaciones.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Error, require: name => deps[name] })
  return { calls, run: () => exports.obtenerConteoDemandasSinOferta() }
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
console.log(`${checks} operational authorization regressions passed`)
