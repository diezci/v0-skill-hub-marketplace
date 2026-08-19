// Filtro preventivo para las superficies públicas y de mensajería. No sustituye
// la revisión humana: bloquea únicamente señales claras y deja el resto al
// sistema de reportes, bloqueo y moderación administrativa.
const REGLAS_CONTENIDO_PROHIBIDO = [
  /\b(?:pornograf\w*|servicios?\s+sexuales?|prostituci\w*|sexo\s+expl[ií]cito)\b/iu,
  /\b(?:venta|comprar?|distribuir)\s+(?:de\s+)?(?:drogas?\s+ilegales?|coca[ií]na|hero[ií]na|armas?)\b/iu,
  /\b(?:te\s+voy\s+a\s+matar|amenaza\s+de\s+muerte|exterminar\s+a)\b/iu,
  /\b(?:material\s+sexual\s+de\s+menores|explotaci[oó]n\s+infantil)\b/iu,
]

export function errorContenidoProhibido(...valores: Array<string | null | undefined>) {
  const contenido = valores.filter(Boolean).join(" \n ")
  if (!contenido) return null
  if (!REGLAS_CONTENIDO_PROHIBIDO.some((regla) => regla.test(contenido))) return null
  return "El contenido incluye términos no permitidos por las Normas de la comunidad. Revísalo antes de publicarlo."
}
