import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  module._compile(outputText, filename)
}

const { traducirErrorServidor } = require("../lib/i18n-errores.ts")
const { traducir, INGLES } = require("../lib/i18n.ts")
const { REGLAS_MODERACION_SOLICITUDES, errorSolicitudNoPublicable, errorContenidoProhibido } = require("../lib/moderacion.ts")

// Include older RPCs that can still exist in an installation, as well as the
// latest contract/payment migrations. No SQL is executed by this test.
const excepciones = new Set()
for (const dir of ["scripts", "supabase/migrations"]) {
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf8")
    for (const match of source.matchAll(/raise\s+exception\s+'((?:''|[^'])*)'/gi)) {
      excepciones.add(match[1].replaceAll("''", "'"))
    }
    // The moderation trigger raises the stored rule message through USING.
    for (const match of source.matchAll(/'(No se puede publicar: (?:''|[^'])*)'/g)) {
      excepciones.add(match[1].replaceAll("''", "'"))
    }
  }
}
for (const es of excepciones) {
  assert.ok(INGLES[es], `SQL error missing an English translation: ${es}`)
  assert.equal(traducirErrorServidor("es", es), es)
  assert.notEqual(traducirErrorServidor("en", es), es)
}
console.log(`PASS ${excepciones.size} static SQL/RPC and database moderation errors covered`)

assert.equal(traducirErrorServidor("en", "No perteneces a esta conversación"), "You are not a participant in this conversation")
assert.equal(traducirErrorServidor("en", "Hay un pago pendiente de conciliar o una liquidación en curso"), "A payment is awaiting reconciliation or a settlement is in progress")
assert.equal(traducirErrorServidor("en", "Confirma tu correo antes de vincular una empresa"), "Confirm your email before linking a company")
assert.equal(traducirErrorServidor("en", "No se puede cambiar la tarifa de una oferta vinculada a un trabajo"), "The fee for an offer linked to a job cannot be changed")
console.log("PASS chat permissions, contract fees, payments and company identity errors are faithful")

for (const regla of REGLAS_MODERACION_SOLICITUDES) {
  for (const es of [
    `No se puede publicar: ${regla.motivoUsuario}.`,
    `No se puede publicar: ${regla.motivoUsuario}. Si se trata de un servicio legítimo, explica claramente su finalidad y las autorizaciones aplicables.`,
  ]) {
    assert.ok(INGLES[es], `Missing moderation error: ${regla.codigo}`)
    assert.match(traducirErrorServidor("en", es), /^Cannot publish: the request appears to /)
  }
}
const moderado = errorSolicitudNoPublicable({ titulo: "Necesito transportar drogas ilegales" })
assert.ok(moderado)
assert.match(traducirErrorServidor("en", moderado), /illegal drugs/)
assert.match(traducirErrorServidor("en", moderado), /legitimate service/)
assert.equal(traducirErrorServidor("en", errorContenidoProhibido("pornografia")), "The content includes terms that are not allowed under the Community Guidelines. Review it before publishing.")
console.log(`PASS ${REGLAS_MODERACION_SOLICITUDES.length} moderation reasons and actual validation results covered`)

const cierre = (count) => `Tienes ${count} disputa(s) abierta(s). Hay que resolverlas antes de darte de baja: si desapareces, la otra parte se queda sin nadie con quien cerrarlas.`
for (const count of ["0", "1", "12", "0007", "9876543210"]) {
  assert.equal(traducirErrorServidor("es", cierre(count)), cierre(count))
  assert.equal(traducirErrorServidor("en", cierre(count)), `You have ${count} open dispute(s). They must be resolved before you delete your account: otherwise, the other party will have nobody to resolve them with.`)
  assert.equal(traducir("en", cierre(count)), cierre(count), "Ordinary UI translation must not perform dynamic error matching")
}
for (const texto of [cierre("-1"), cierre("1.5"), cierre("$& {cantidad}"), `Mi comentario: ${cierre("2")}`, `${cierre("2")} Texto añadido`, "Una descripción original del cliente"]) {
  assert.equal(traducirErrorServidor("en", texto), texto, "Unknown or partial messages must stay verbatim")
}
console.log("PASS legacy SQL interpolation is restricted to a whole-template digit-only count, preserving the exact value")
console.log("RPC error localization checks passed without database or network access.")
