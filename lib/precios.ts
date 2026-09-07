// Topes de los controles de precio. Son DOS cosas distintas y por eso hay dos
// constantes: compartir una sola hacía que el filtro de tarifa por hora de
// /profesionales llegara hasta 100.000 €/h.

// Presupuesto TOTAL de un proyecto: formulario de demanda, wizard, filtro de
// /demandas y preferencias de avisos del profesional. El extremo derecho
// representa "y más" (se muestra "100.000€+").
export const PRECIO_MAX = 100000
export const PASO_PRECIO = 500

// Tarifa POR HORA de un profesional: filtro de /profesionales. Un precio/hora
// realista no se acerca al presupuesto de una obra entera.
export const PRECIO_HORA_MAX = 1000
export const PASO_PRECIO_HORA = 10

/** Valida cifras de una demanda en la frontera del servidor. */
export function esRangoPresupuestoValido(
  minimo: number | null | undefined,
  maximo: number | null | undefined,
) {
  const esLimiteValido = (valor: number | null | undefined) =>
    valor === null || valor === undefined || (typeof valor === "number" && Number.isFinite(valor) && valor >= 0)

  return (
    esLimiteValido(minimo) &&
    esLimiteValido(maximo) &&
    (minimo === null || minimo === undefined || maximo === null || maximo === undefined || minimo <= maximo)
  )
}
