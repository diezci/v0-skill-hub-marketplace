/**
 * Decide si el presupuesto publicado de una demanda se solapa con el rango
 * elegido por un profesional para sus avisos.
 *
 * `null` representa un extremo abierto. Si el cliente deja el presupuesto "A
 * convenir" no hay una cifra que permita descartarlo de forma fiable, por lo
 * que se conserva el aviso. Así el filtro evita encargos conocidos fuera del
 * rango sin hacer perder oportunidades cuyo importe todavía se negociará.
 */
export function encajaEnPresupuestoDeAvisos(
  demandaMin: number | string | null | undefined,
  demandaMax: number | string | null | undefined,
  interesMin: number | string | null | undefined,
  interesMax: number | string | null | undefined,
) {
  const dMin = importePublicado(demandaMin)
  const dMax = importePublicado(demandaMax)
  const pMin = limiteDeInteres(interesMin)
  const pMax = limiteDeInteres(interesMax)

  if ([dMin, dMax, pMin, pMax].some((importe) => importe !== null && Number.isNaN(importe))) return false
  if (dMin !== null && dMax !== null && dMin > dMax) return false
  if (pMin !== null && pMax !== null && pMin > pMax) return false

  // Sin cifras publicadas, el presupuesto sigue abierto a negociación.
  if (dMin === null && dMax === null) return true

  const limiteInferiorDemanda = dMin ?? Number.NEGATIVE_INFINITY
  // Las demandas antiguas que solo conservan presupuesto_min se muestran como
  // una cifra concreta, no como "desde X"; el matching respeta esa misma
  // semántica. Solo presupuesto_max sí significa "hasta X".
  const limiteSuperiorDemanda = dMax ?? dMin ?? Number.POSITIVE_INFINITY
  const limiteInferiorInteres = pMin ?? Number.NEGATIVE_INFINITY
  const limiteSuperiorInteres = pMax ?? Number.POSITIVE_INFINITY

  return limiteSuperiorDemanda >= limiteInferiorInteres && limiteInferiorDemanda <= limiteSuperiorInteres
}

function convertirImporte(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) return null
  const numero = typeof valor === "number" ? valor : Number(valor)
  return Number.isFinite(numero) && numero >= 0 ? numero : Number.NaN
}

function importePublicado(valor: number | string | null | undefined) {
  const importe = convertirImporte(valor)
  // El resto de la app presenta 0 como ausencia de presupuesto ("A convenir").
  return importe === 0 ? null : importe
}

function limiteDeInteres(valor: number | string | null | undefined) {
  return convertirImporte(valor)
}
