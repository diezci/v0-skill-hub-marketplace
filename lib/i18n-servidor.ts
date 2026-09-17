import "server-only"

import { traducirErrorServidor } from "./i18n-errores"
import { cookies, headers } from "next/headers"
import { IDIOMA_COOKIE, esIdiomaValido, traducir, detectarIdioma, type Idioma, type ParametrosTraduccion } from "./i18n"

// Idioma elegido, leído de la cookie. Para componentes de SERVIDOR: así el HTML
// sale ya traducido y no hay parpadeo de español a inglés al hidratar.
export async function idiomaActual(): Promise<Idioma> {
  const valor = (await cookies()).get(IDIOMA_COOKIE)?.value
  return esIdiomaValido(valor) ? valor : detectarIdioma((await headers()).get("accept-language"))
}

// Atajo: devuelve el idioma y su función de traducción ya atada.
export async function getT() {
  const idioma = await idiomaActual()
  return { idioma, t: (clave: string, parametros?: ParametrosTraduccion) => traducir(idioma, clave, parametros) }
}

/** Localize application-generated server responses in the request language. */
export function textoServidor(texto: string): Promise<string>
export function textoServidor(texto: string | undefined): Promise<string | undefined>
export async function textoServidor(texto: string | undefined) {
  return texto === undefined ? undefined : traducirErrorServidor(await idiomaActual(), texto)
}
