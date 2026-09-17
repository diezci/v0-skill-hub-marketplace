import type { Idioma } from "./i18n"
import { EN_NOTIFICACIONES } from "./traducciones/notificaciones"

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Match complete, known system templates only. Project titles, names, dispute
// reasons and other captured content are copied verbatim, never translated.
const plantillas = Object.entries(EN_NOTIFICACIONES)
  .filter(([original]) => /\{\d+\}/.test(original))
  .map(([original, traduccion]) => {
    const claves: string[] = []
    let posicion = 0
    let patron = "^"
    for (const marcador of original.matchAll(/\{(\d+)\}/g)) {
      patron += escaparRegex(original.slice(posicion, marcador.index)) + "([\\s\\S]*?)"
      claves.push(marcador[1])
      posicion = marcador.index! + marcador[0].length
    }
    patron += escaparRegex(original.slice(posicion)) + "$"
    return { original, traduccion, claves, patron: new RegExp(patron) }
  })

export function traducirTextoNotificacion(idioma: Idioma, texto: string, tipo?: string): string {
  if (idioma === "es" || !texto || tipo === "mensaje") return texto
  const exacta = EN_NOTIFICACIONES[texto]
  if (exacta) return exacta

  for (const plantilla of plantillas) {
    const coincidencia = plantilla.patron.exec(texto)
    if (!coincidencia) continue
    const valores = Object.fromEntries(plantilla.claves.map((clave, i) => [clave, coincidencia[i + 1]]))
    return plantilla.traduccion.replace(/\{(\d+)\}/g, (_, clave: string) => valores[clave] ?? `{${clave}}`)
  }
  return texto
}
