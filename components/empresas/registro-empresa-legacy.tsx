"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Building2, Check, FileCheck2, Loader2, ShieldCheck, Users } from "lucide-react"
import { completarRegistroEmpresa, obtenerRegistroEmpresaPendiente, type RegistroEmpresa } from "@/app/actions/empresas"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Only company creation. Joining an existing company always uses an individual invitation. */
export default function RegistroEmpresaLegacy() {
  const t = useT()
  const router = useRouter()
  const [registro, setRegistro] = useState<RegistroEmpresa>({ documentoPersonal: "" })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelado = false
    obtenerRegistroEmpresaPendiente().then((result) => {
      if (!cancelado && result.data) {
        const { tokenInvitacion: _token, ...datos } = result.data
        setRegistro({ ...datos, documentoPersonal: datos.documentoPersonal || "" })
      }
    }).catch(() => { if (!cancelado) setError("No se pudieron cargar los datos de tu empresa. Actualiza la página para volver a intentarlo.") }).finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [])
  const actualizar = (campo: keyof RegistroEmpresa, valor: string) => setRegistro((r) => ({ ...r, [campo]: valor }))
  async function guardar(event: FormEvent) {
    event.preventDefault(); setGuardando(true); setError("")
    try {
      const { tokenInvitacion: _token, ...datos } = registro
      const result = await completarRegistroEmpresa(datos)
      if (result.error) { setError(result.error); return }
      router.refresh()
    } catch { setError("No se pudo guardar la empresa. Puedes volver a intentarlo.") }
    finally { setGuardando(false) }
  }
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
    <div className="grid overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <aside className="relative isolate overflow-hidden bg-[#153e2b] p-6 text-white sm:p-9 lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-24 -z-10 size-80 rounded-full border-[40px] border-white/[0.04]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-20 -z-10 size-72 rounded-full border-[40px] border-white/[0.04]" />
        <div className="flex size-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><Building2 className="size-6 text-emerald-200" aria-hidden="true" /></div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">{t("Mi empresa")}</p>
        <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{t("Tu empresa, en un solo lugar.")}</h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/75">{t("Gestionarás la cuenta como responsable principal. Después podrás completar el perfil, acreditar la representación e invitar al equipo.")}</p>
        <ol className="mt-8 space-y-4 lg:mt-12">
          <li className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200"><Building2 className="size-4" aria-hidden="true" /></span><span className="text-sm font-medium">{t("Completa el perfil")}</span></li>
          <li className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200"><FileCheck2 className="size-4" aria-hidden="true" /></span><span className="text-sm font-medium">{t("Acredita la representación")}</span></li>
          <li className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200"><Users className="size-4" aria-hidden="true" /></span><span className="text-sm font-medium">{t("Invita a tu equipo")}</span></li>
        </ol>
      </aside>
      <Card className="gap-5 rounded-none border-0 py-6 shadow-none sm:py-8">
        <CardHeader className="px-6 sm:px-8"><CardTitle><h2 className="text-xl tracking-tight">{t("Crear mi empresa")}</h2></CardTitle><CardDescription className="leading-relaxed">{t("Datos de la empresa")}</CardDescription></CardHeader>
        <CardContent className="px-6 sm:px-8">
          <form onSubmit={guardar} className="space-y-6" aria-busy={guardando || cargando}>
            <fieldset disabled={guardando || cargando} className="min-w-0 space-y-6">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2"><Label htmlFor="empresa-nombre">{t("Nombre de la empresa")}</Label><Input id="empresa-nombre" className="h-11 rounded-lg" required maxLength={120} value={registro.nombreEmpresa || ""} onChange={(e) => actualizar("nombreEmpresa", e.target.value)} /></div>
                <div className="min-w-0 space-y-2"><Label htmlFor="empresa-cif">{t("CIF")}</Label><Input id="empresa-cif" className="h-11 rounded-lg" required value={registro.cif || ""} onChange={(e) => actualizar("cif", e.target.value.toUpperCase())} /></div>
              </div>
              <section className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-4 sm:p-5" aria-labelledby="empresa-responsable-titulo">
                <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /><h3 id="empresa-responsable-titulo" className="text-sm font-semibold">{t("Responsable de la cuenta Diime")}</h3></div>
                <div className="space-y-2"><Label htmlFor="empresa-documento" className="leading-relaxed">{t("Tu DNI/NIE como responsable de la cuenta")}</Label><Input id="empresa-documento" className="h-11 rounded-lg bg-background" required value={registro.documentoPersonal} onChange={(e) => actualizar("documentoPersonal", e.target.value.toUpperCase())} /></div>
                <div className="space-y-2"><Label htmlFor="empresa-cargo">{t("Cargo en la empresa")}</Label><Input id="empresa-cargo" className="h-11 rounded-lg bg-background" required minLength={2} maxLength={120} value={registro.cargoEmpresa || ""} onChange={(e) => actualizar("cargoEmpresa", e.target.value)} /></div>
              </section>
            </fieldset>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("Crear la cuenta no acredita la representación legal. El perfil se publicará cuando Diime complete la revisión.")}</p>
            {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{t(error)}</p>}
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={guardando || cargando}>{(guardando || cargando) ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}{t(guardando ? "Guardando..." : "Crear empresa")}{!guardando && !cargando && <ArrowRight className="ml-auto size-4" aria-hidden="true" />}</Button>
          </form>
          <p className="mt-6 border-t border-border/60 pt-5 text-xs leading-relaxed text-muted-foreground">{t("Si has recibido una invitación, abre su enlace desde la cuenta a la que está dirigida.")}</p>
        </CardContent>
      </Card>
    </div>
  </div>
}
