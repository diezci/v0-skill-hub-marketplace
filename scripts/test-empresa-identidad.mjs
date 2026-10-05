import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync("lib/empresas/identidad.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, require(name) {
  assert.equal(name, "server-only")
  return {}
} })
const { validarEmpresaOperacion, validarActorTrabajoEmpresa, identidadesEmpresas } = module.exports
const empresa = "11111111-1111-4111-8111-111111111111"
const otra = "22222222-2222-4222-8222-222222222222"
const llamadas = []
let contexto = { id: empresa }
let fallo = false
let usuario = "empleado"
let autorizado = true
const db = {
  auth: { async getUser() { return { data: { user: usuario ? { id: usuario } : null } } } },
  async rpc(nombre, args) {
    llamadas.push([nombre, args])
    if (nombre === "empresa_identidades_publicas") return { data: [{ id: empresa, nombre: "Empresa" }], error: fallo ? {} : null }
    if (nombre === "empresa_puede_operar_trabajo") return { data: autorizado, error: fallo ? {} : null }
    assert.equal(nombre, "empresa_contexto_actual")
    return { data: contexto, error: fallo ? {} : null }
  },

}
assert.equal(await validarEmpresaOperacion(db, null), undefined, "Personal operations need no company membership")
assert.equal(llamadas.length, 0)
assert.ok(await validarEmpresaOperacion(db, "not-a-uuid"), "Reject malformed identities")
assert.equal(llamadas.length, 0)
assert.ok(await validarEmpresaOperacion(db, otra), "An employee cannot select someone else's company")
assert.equal(await validarEmpresaOperacion(db, empresa), undefined)
assert.equal(await validarActorTrabajoEmpresa(db, "trabajo", "empleado"), undefined)
assert.equal(llamadas.at(-1)[1].p_permiso, "encargos")
assert.ok(await validarActorTrabajoEmpresa(db, "trabajo", "intruso"), "Cannot supply another actor's identity")
autorizado = false
assert.ok(await validarActorTrabajoEmpresa(db, "trabajo", "empleado"), "Revocation denies the original actor too")
usuario = "administrador"
autorizado = true
assert.equal(await validarActorTrabajoEmpresa(db, "trabajo", usuario, "gestionar_cobros", "cliente"), undefined)
assert.equal(llamadas.at(-1)[1].p_permiso, "gestionar_cobros", "Financial permission must be checked independently")
assert.equal(llamadas.at(-1)[1].p_parte, "cliente", "A provider manager cannot approve a client's payment")
usuario = null
assert.ok(await validarActorTrabajoEmpresa(db, "trabajo", "administrador"), "Unauthenticated cannot operate jobs")
usuario = "empleado"
fallo = true
assert.ok(await validarEmpresaOperacion(db, empresa), "A membership read error must deny company writes")
assert.ok(await validarActorTrabajoEmpresa(db, "trabajo", "empleado"), "A work read error must deny privileged operations")
fallo = false
assert.equal(Object.keys(await identidadesEmpresas(db, [])).length, 0)
const identidades = await identidadesEmpresas(db, [empresa, empresa, null])
assert.equal(identidades[empresa].nombre, "Empresa")
assert.equal(llamadas.at(-1)[1].p_ids.length, 1, "Public identities are batched and deduplicated")
fallo = true
await assert.rejects(() => identidadesEmpresas(db, [empresa]), /identidad/, "Do not silently label a company operation as personal")
console.log("Empresa identidad: 14 authorization and attribution checks passed.")
