"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { obtenerResumenNotificaciones, marcarNotificacionesLeidasPorIds } from "@/app/actions/notificaciones"
import { avisoPerteneceAEntidad, type NotificacionContextual } from "@/lib/notificaciones-contexto"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { useT } from "@/components/idioma-provider"

type Resumen = Awaited<ReturnType<typeof obtenerResumenNotificaciones>>
const VACIO: Resumen = { notificaciones: [], noLeidas: 0, mensajesNoLeidos: 0, porSeccion: {}, ultimoMensajeNoLeido: null }
const Contexto = createContext({ usuarioId: null as string | null, resumen: VACIO, cargando: true, error: "", recargar: async () => {}, marcarLeidas: async (_ids: string[]) => false })

// One subscription/poll for navbar, section panel and all cards. Reset state
// and invalidate outstanding requests when the authenticated account changes.
export function NotificacionesProvider({ children, desactivado = false }: { children: ReactNode; desactivado?: boolean }) {
  const [resumen, setResumen] = useState<Resumen>(VACIO)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  // Session changes invalidate every operation. A read mutation only
  // invalidates older summaries, not other simultaneous read mutations.
  const version = useRef(0)
  const revisionResumen = useRef(0)
  const usuario = useRef<string | null>(null)
  const pendiente = useRef<number | null>(null)
  const recargar = useCallback(async () => {
    if (desactivado || !usuario.current || pendiente.current !== null) return
    const actual = version.current
    const revision = ++revisionResumen.current
    pendiente.current = revision
    try {
      const r = await obtenerResumenNotificaciones()
      if (actual !== version.current || revision !== revisionResumen.current) return
      if ("error" in r && r.error) setError(r.error)
      else { setResumen(r); setError("") }
    } catch { if (actual === version.current && revision === revisionResumen.current) setError("No se pudieron cargar las notificaciones") }
    finally { if (actual === version.current && pendiente.current === revision) { pendiente.current = null; setCargando(false) } }
  }, [desactivado])

  useEffect(() => {
    if (desactivado) {
      version.current++; revisionResumen.current++; pendiente.current = null; usuario.current = null
      setUsuarioId(null); setResumen(VACIO); setError(""); setCargando(false)
      return
    }
    let activo = true
    const supabase = createClient()
    const cambiarUsuario = (id: string | null) => {
      if (!activo) return
      if (usuario.current !== id) {
        version.current++; revisionResumen.current++; pendiente.current = null; usuario.current = id
        setUsuarioId(id); setResumen(VACIO); setError(""); setCargando(!!id)
      }
      if (!id) setCargando(false)
    }
    let revisionSesion = 0
    const revisionInicial = revisionSesion
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (activo && revisionInicial === revisionSesion) {
        cambiarUsuario(user?.id || null)
        if (user?.id) void recargar()
      }
    }).catch(() => { if (activo && revisionInicial === revisionSesion) setCargando(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const revision = ++revisionSesion
      // Invalidate old requests immediately; defer network work to avoid
      // re-entering Supabase's auth callback while it holds its session lock.
      cambiarUsuario(session?.user?.id || null)
      queueMicrotask(() => { if (activo && revision === revisionSesion && session?.user?.id) void recargar() })
    })
    const actualizar = () => { if (document.visibilityState !== "hidden") void recargar() }
    const intervalo = window.setInterval(actualizar, 15000)
    for (const evento of ["diime:notification", "diime:push", "focus"]) window.addEventListener(evento, actualizar)
    document.addEventListener("visibilitychange", actualizar)
    return () => {
      activo = false; version.current++; revisionResumen.current++; pendiente.current = null
      subscription.unsubscribe(); clearInterval(intervalo)
      for (const evento of ["diime:notification", "diime:push", "focus"]) window.removeEventListener(evento, actualizar)
      document.removeEventListener("visibilitychange", actualizar)
    }
  }, [desactivado, recargar])

  const marcarLeidas = useCallback(async (ids: string[]) => {
    if (!ids.length) return true
    if (desactivado || !usuario.current) return false
    const actual = version.current
    let r: Awaited<ReturnType<typeof marcarNotificacionesLeidasPorIds>>
    try { r = await marcarNotificacionesLeidasPorIds(ids) }
    catch { if (actual === version.current) setError("No se pudieron marcar las notificaciones"); return false }
    if (actual !== version.current) return false
    if (r.error) { setError(r.error); return false }
    revisionResumen.current++; pendiente.current = null
    setResumen(prev => {
      const restantes = prev.notificaciones.filter(n => !ids.includes(n.id))
      const porSeccion: Record<string, number> = {}
      restantes.forEach(n => { porSeccion[n.seccion] = (porSeccion[n.seccion] || 0) + 1 })
      return { ...prev, notificaciones: restantes, noLeidas: restantes.length, porSeccion }
    })
    setError(""); setCargando(false)
    window.dispatchEvent(new CustomEvent("diime:notification"))
    return true
  }, [desactivado])

  return <Contexto.Provider value={{ usuarioId, resumen, cargando, error, recargar, marcarLeidas }}>{children}</Contexto.Provider>
}

export function useResumenNotificaciones() { return useContext(Contexto) }

export function useNotificacionesSeccion(seccion: string) {
  const { resumen, cargando, error, recargar, marcarLeidas: marcar } = useContext(Contexto)
  const { toast } = useToast()
  const t = useT()
  const notificaciones = useMemo(() => resumen.notificaciones.filter(n => n.seccion === seccion), [resumen.notificaciones, seccion])
  const paraEntidad = useCallback((entidad: { solicitudId?: string | null; trabajoId?: string | null; ofertaId?: string | null }): NotificacionContextual[] =>
    notificaciones.filter(n => !n.leida && avisoPerteneceAEntidad(n, entidad)), [notificaciones])
  const marcarLeidas = useCallback(async (ids: string[]) => {
    try {
      const ok = await marcar(ids)
      if (!ok) toast({ title: t("Error"), description: t("No se pudieron marcar las notificaciones"), variant: "destructive" })
      return ok
    } catch {
      toast({ title: t("Error"), description: t("No se pudieron marcar las notificaciones"), variant: "destructive" })
      return false
    }
  }, [marcar, t, toast])
  return { notificaciones, pendientes: notificaciones.filter(n => !n.leida), paraEntidad, marcarLeidas, recargar, cargando, error }
}
