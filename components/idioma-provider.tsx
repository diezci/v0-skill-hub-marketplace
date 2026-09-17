"use client"

import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { IDIOMA_COOKIE, IDIOMA_POR_DEFECTO, traducir, esIdiomaValido, type Idioma, type Traductor, type ParametrosTraduccion } from "@/lib/i18n"

import { createClient } from "@/lib/supabase/client"
import { guardarIdioma } from "@/app/actions/idioma"

type Contexto = {
  idioma: Idioma
  cambiarIdioma: (nuevo: Idioma) => void
  t: Traductor
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
export function IdiomaProvider({ idioma: idiomaServidor, children }: { idioma: Idioma; children: React.ReactNode }) {
  const router = useRouter()
  const [idioma, setIdioma] = useState(idiomaServidor)
  const guardando = useRef(Promise.resolve())
  const revision = useRef(0)
  const pendiente = useRef(false)
  const eleccion = useRef(idiomaServidor)
  useEffect(() => {
    const cookie = document.cookie.split("; ").find((part) => part.startsWith(`${IDIOMA_COOKIE}=`))?.split("=")[1]
    if (!pendiente.current && (!esIdiomaValido(cookie) || cookie === idiomaServidor)) setIdioma(idiomaServidor)
  }, [idiomaServidor])
  useEffect(() => { document.documentElement.lang = idioma }, [idioma])

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    let activo = true
    const mensaje = { type: "DIIME_IDIOMA", idioma }
    const comunicar = () => navigator.serviceWorker.controller?.postMessage(mensaje)
    comunicar()
    navigator.serviceWorker.ready.then((registro) => {
      if (activo) registro.active?.postMessage(mensaje)
    }).catch(() => {})
    navigator.serviceWorker.addEventListener("controllerchange", comunicar)
    return () => {
      activo = false
      navigator.serviceWorker.removeEventListener("controllerchange", comunicar)
    }
  }, [idioma])

  // Restore the account preference on a new device; an explicit local choice wins.
  useEffect(() => {
    let activo = true
    let unsubscribe: (() => void) | undefined
    try {
      const supabase = createClient()
      const sincronizar = async () => {
        const solicitud = revision.current
        const { data: { user } } = await supabase.auth.getUser()
        if (!activo || !user || pendiente.current || solicitud !== revision.current) return
        const cookie = document.cookie.split("; ").find((part) => part.startsWith(`${IDIOMA_COOKIE}=`))?.split("=")[1]
        const guardado = user.user_metadata?.idioma
        if (!esIdiomaValido(cookie) && esIdiomaValido(guardado)) {
          document.cookie = `${IDIOMA_COOKIE}=${guardado}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
          eleccion.current = guardado
          setIdioma(guardado)
          router.refresh()
        } else {
          const preferido = esIdiomaValido(cookie) ? cookie : idiomaServidor
          if (guardado !== preferido) {
            // Automatic reconciliation and explicit choices share one queue.
            // An older account save must finish before the latest choice saves.
            guardando.current = guardando.current.catch(() => {}).then(async () => {
              if (!activo || pendiente.current || solicitud !== revision.current) return
              try {
                await guardarIdioma(preferido)
              } finally {
                // The completed action may have returned an outdated Set-Cookie.
                if (solicitud !== revision.current) {
                  document.cookie = `${IDIOMA_COOKIE}=${eleccion.current}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
                }
              }
            })
            await guardando.current
          }
        }
      }
      void sincronizar().catch(() => {})
      const { data } = supabase.auth.onAuthStateChange((evento) => {
        if (evento === "SIGNED_IN") queueMicrotask(() => { if (activo) void sincronizar().catch(() => {}) })
      })
      unsubscribe = () => data.subscription.unsubscribe()
    } catch { /* A public page can still switch language without an auth service. */ }
    return () => { activo = false; unsubscribe?.() }
  }, [router, idiomaServidor])

  const cambiarIdioma = useCallback(
    (nuevo: Idioma) => {
      if (!esIdiomaValido(nuevo)) return
      const solicitud = ++revision.current
      pendiente.current = true
      eleccion.current = nuevo
      setIdioma(nuevo)
      // Cookie (no localStorage) para que el servidor también la vea. Un año,
      // en la raíz, y SameSite=Lax por ser una simple preferencia.
      document.cookie = `${IDIOMA_COOKIE}=${nuevo}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      // refresh() y no reload(): vuelve a pedir los componentes de servidor con
      // la cookie nueva sin perder el estado del cliente.
      guardando.current = guardando.current.catch(() => {}).then(async () => {
        if (solicitud !== revision.current) return
        try { await guardarIdioma(nuevo) } catch { /* The local preference remains available offline. */ }
        finally {
          // An earlier action may set its cookie after a newer local selection.
          document.cookie = `${IDIOMA_COOKIE}=${eleccion.current}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
          if (solicitud === revision.current) {
            pendiente.current = false
            router.refresh()
          }
        }
      })
    },
    [router],
  )

  const t = useCallback((clave: string, parametros?: ParametrosTraduccion) => traducir(idioma, clave, parametros), [idioma])

  return <IdiomaContext.Provider value={{ idioma, cambiarIdioma, t }}>{children}</IdiomaContext.Provider>
}
