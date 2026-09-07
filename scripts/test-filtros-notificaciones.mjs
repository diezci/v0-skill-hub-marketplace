import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { encajaEnPresupuestoDeAvisos } from "../lib/filtros-notificaciones.ts"
import { PRECIO_MAX, esRangoPresupuestoValido } from "../lib/precios.ts"

const casos = [
  ["rangos solapados", [300, 600, 400, 1000], true],
  ["límite compartido incluido", [300, 600, 600, 1000], true],
  ["demanda por debajo", [300, 599, 600, 1000], false],
  ["demanda por encima", [700, 900, null, 600], false],
  ["demanda solo con máximo", [null, 500, 600, null], false],
  ["demanda solo con mínimo", [1000, null, null, 999], false],
  ["una sola cifra no se interpreta como mínimo abierto", [500, null, 1000, null], false],
  ["solapamiento con máximo abierto", [1000, null, 900, null], true],
  ["solapamiento con mínimo abierto", [null, 500, null, 600], true],
  ["presupuesto a convenir", [null, null, 1000, 5000], true],
  ["cero se presenta y se trata como a convenir", [0, 0, 1000, 5000], true],
  ["profesional sin límites", [250, 400, null, null], true],
  ["ambos rangos abiertos", [null, null, null, null], true],
  ["extremos del control", [100000, 100000, 0, 100000], true],
  ["importes serializados como texto", ["300", "600", "400", "1000"], true],
  ["rango de demanda invertido", [1000, 500, null, null], false],
  ["rango profesional invertido", [500, 1000, 1200, 800], false],
  ["a convenir no acepta un filtro corrupto", [null, null, 1200, 800], false],
  ["importe inválido", [Number.NaN, 1000, null, null], false],
  ["importe infinito", [500, Number.POSITIVE_INFINITY, null, null], false],
  ["texto no numérico", ["mucho", "1000", null, null], false],
  ["espacios no equivalen a cero", ["   ", "   ", 1000, 5000], true],
  ["undefined equivale a extremo abierto", [undefined, 500, null, 600], true],
]

for (const [nombre, argumentos, esperado] of casos) {
  assert.equal(encajaEnPresupuestoDeAvisos(...argumentos), esperado, nombre)
}

assert.equal(esRangoPresupuestoValido(300, 600), true)
assert.equal(esRangoPresupuestoValido(null, null), true)
assert.equal(esRangoPresupuestoValido(600, 300), false)
assert.equal(esRangoPresupuestoValido(-1, 300), false)
assert.equal(esRangoPresupuestoValido(0, Number.POSITIVE_INFINITY), false)

// Contrato estático mínimo: protege el cableado que el helper aislado no puede
// cubrir y mantiene el tope de UI/servidor sincronizado con la migración.
const invitaciones = readFileSync(new URL("../app/actions/invitaciones.ts", import.meta.url), "utf8")
assert.match(invitaciones, /presupuesto_min, presupuesto_max/)
assert.match(invitaciones, /presupuesto_min_interes, presupuesto_max_interes/)
assert.match(invitaciones, /encajaEnPresupuestoDeAvisos\(/)

const migracion = readFileSync(
  new URL("../supabase/migrations/051_presupuesto_avisos_profesionales.sql", import.meta.url),
  "utf8",
)
assert.match(migracion, /presupuesto_min_interes numeric\(10, 2\)/)
assert.match(migracion, /presupuesto_max_interes numeric\(10, 2\)/)
assert.equal((migracion.match(new RegExp(`between 0 and ${PRECIO_MAX}`, "g")) || []).length, 2)
assert.match(migracion, /presupuesto_min_interes <= presupuesto_max_interes/)
assert.match(migracion, /solicitudes_presupuesto_valido_check/)

console.log(`OK: ${casos.length} casos de filtros de avisos`)
