import "server-only"

import { cookies } from "next/headers"
import { IDIOMA_COOKIE, IDIOMA_POR_DEFECTO, esIdiomaValido, traducir, type Idioma } from "./i18n"

// Idioma elegido, leído de la cookie. Para componentes de SERVIDOR: así el HTML
// sale ya traducido y no hay parpadeo de español a inglés al hidratar.
export async function idiomaActual(): Promise<Idioma> {
  const valor = (await cookies()).get(IDIOMA_COOKIE)?.value
  return esIdiomaValido(valor) ? valor : IDIOMA_POR_DEFECTO
}

// Atajo: devuelve el idioma y su función de traducción ya atada.
export async function getT() {
  const idioma = await idiomaActual()
  return { idioma, t: (clave: string) => traducir(idioma, clave) }
}
