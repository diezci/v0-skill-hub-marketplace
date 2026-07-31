"use client"

import { createContext, useContext, useCallback } from "react"
import { useRouter } from "next/navigation"
import { IDIOMA_COOKIE, IDIOMA_POR_DEFECTO, traducir, type Idioma } from "@/lib/i18n"

type Contexto = {
  idioma: Idioma
  cambiarIdioma: (nuevo: Idioma) => void
  t: (clave: string) => string
}

const IdiomaContext = createContext<Contexto>({
  idioma: IDIOMA_POR_DEFECTO,
  cambiarIdioma: () => {},
  t: (clave) => traducir(IDIOMA_POR_DEFECTO, clave),
})

export function useIdioma() {
  return useContext(IdiomaContext)
}

// Atajo para el caso habitual: solo traducir.
export function useT() {
  return useContext(IdiomaContext).t
}

// El idioma llega desde el servidor (leído de la cookie en el layout), no de un
// useState con valor inicial: si se decidiera en el cliente, el primer render
// saldría en español y cambiaría al hidratar.
export function IdiomaProvider({ idioma, children }: { idioma: Idioma; children: React.ReactNode }) {
  const router = useRouter()

  const cambiarIdioma = useCallback(
    (nuevo: Idioma) => {
      // Cookie (no localStorage) para que el servidor también la vea. Un año,
      // en la raíz, y SameSite=Lax por ser una simple preferencia.
      document.cookie = `${IDIOMA_COOKIE}=${nuevo}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      // refresh() y no reload(): vuelve a pedir los componentes de servidor con
      // la cookie nueva sin perder el estado del cliente.
      router.refresh()
    },
    [router],
  )

  const t = useCallback((clave: string) => traducir(idioma, clave), [idioma])

  return <IdiomaContext.Provider value={{ idioma, cambiarIdioma, t }}>{children}</IdiomaContext.Provider>
}
