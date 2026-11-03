"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { crearConversacionEmpresa } from "@/app/actions/messages"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import { ArrowRight, CheckCircle2, Hammer, Loader2, MapPin, MessageSquare, Users } from "lucide-react"
import { solicitarPresupuestoEmpresa } from "@/app/actions/empresa-workspace"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import PerfilProfesionalPublico from "@/components/perfil-profesional-publico"
import { EquipoEmpresa } from "@/components/empresas/equipo-empresa"
import { perfilProfesionalDeEmpresa } from "@/lib/empresas/perfil-profesional"
import { localeDe } from "@/lib/i18n"
import type { EmpresaPublica, TrabajoEmpresa } from "@/lib/empresas/types"

export { InicialesEmpresa } from "@/components/empresas/equipo-empresa"

export function webPublicaSegura(web: string): string | null {
  try {
    const url = new URL(web)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function Fecha({ fecha }: { fecha: string }) {
  const { idioma } = useIdioma()
  const date = new Date(`${fecha.slice(0, 10)}T12:00:00`)
  return <>{Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(localeDe(idioma), { month: "long", year: "numeric" })}</>
}

export function TrabajoEmpresaCard({ trabajo, participacion = false }: { trabajo: TrabajoEmpresa; participacion?: boolean }) {
  const t = useT()
  return (
    <Card className="group overflow-hidden gap-0 py-0 transition-shadow hover:shadow-md">
      <div className="relative flex h-36 items-center justify-center bg-muted">
        {trabajo.imagen ? <Image src={trabajo.imagen} alt={t("Ilustración del proyecto: {titulo}", { titulo: trabajo.titulo })} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" unoptimized /> : <Hammer className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />}
        <span className="absolute bottom-3 left-3 rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground">{t(trabajo.imagen?.startsWith("/images/empresas-local/") ? "Ilustración del proyecto" : trabajo.imagen ? "Proyecto realizado" : "Proyecto sin fotografías")}</span>
      </div>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{trabajo.categoria}</span><span aria-hidden="true">·</span><span><Fecha fecha={trabajo.fecha} /></span></div>
        <h3 className="text-base font-semibold leading-snug">{trabajo.titulo}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{trabajo.descripcion}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-3.5" />{trabajo.ubicacion}</span>{trabajo.rangoPrecio && <span className="font-medium">{trabajo.rangoPrecio}</span>}</div>
        {participacion && <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Users className="size-3.5" />{t("Participación en un trabajo de la empresa")}</p>}
      </CardContent>
    </Card>
  )
}

export function ContactarEmpresa({ datos, className, texto = "Contactar empresa" }: { datos: EmpresaPublica; className?: string; texto?: string }) {
  const t = useT()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function contactar() {
    if (pending) return
    setPending(true); setError("")
    try {
      const { data: { user } } = await createClient().auth.getUser()
      if (!user) { router.push(`/auth/login?next=${encodeURIComponent(`/empresa/${datos.empresa.id}`)}`); return }
      if (user.id === datos.contactoUsuarioId) { router.push("/mi-empresa"); return }
      const result = await crearConversacionEmpresa(datos.empresa.id)
      if (result.error || !result.data?.id) setError(result.error || "No se pudo abrir el chat.")
      else router.push(`/mensajes?c=${encodeURIComponent(result.data.id)}`)
    } catch { setError("No se pudo abrir el chat.") }
    finally { setPending(false) }
  }
  return <div className={className}><Button className="w-full" onClick={contactar} disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}{t(texto)}</Button>{error && <p role="alert" className="mt-2 text-sm text-destructive">{t(error)}</p>}</div>
}

export function SolicitarPresupuestoEmpresa({ datos, className, vistaPrevia = false }: { datos: EmpresaPublica; className?: string; vistaPrevia?: boolean }) {
  const t = useT()
  if (vistaPrevia) return <Button className={className} disabled aria-describedby="empresa-vista-previa-contacto"><MessageSquare className="size-4" />{t(datos.local ? "Pedir presupuesto" : "Contactar empresa")}</Button>
  return datos.local ? <SolicitarPresupuestoEmpresaLocal datos={datos} className={className} /> : <ContactarEmpresa datos={datos} className={className} />
}

function SolicitarPresupuestoEmpresaLocal({ datos, className }: { datos: EmpresaPublica; className?: string }) {
  const t = useT()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [guardada, setGuardada] = useState(false)

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (guardando) return
    setError("")
    setGuardando(true)
    const formulario = new FormData(event.currentTarget)
    try {
      const result = await solicitarPresupuestoEmpresa({ empresaId: datos.empresa.id, titulo: String(formulario.get("titulo") || ""), descripcion: String(formulario.get("descripcion") || "") })
      if (result.error) setError(result.error)
      else setGuardada(true)
    } catch { setError(t("No se ha podido guardar la solicitud. Inténtalo de nuevo.")) }
    finally { setGuardando(false) }
  }

  return <>
    <Button className={className} onClick={() => { setError(""); setGuardada(false); setAbierto(true) }}><MessageSquare className="size-4" />{t("Pedir presupuesto")}</Button>
    <Dialog open={abierto} onOpenChange={(open) => { if (!guardando) setAbierto(open) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{guardada ? t("Solicitud guardada") : t("Cuéntanos tu proyecto")}</DialogTitle><DialogDescription>{guardada ? t("Puedes seguir explorando el perfil de la empresa.") : t("Tu solicitud se dirige a {empresa}", { empresa: datos.empresa.razonSocial })}</DialogDescription></DialogHeader>
        {guardada ? <div className="space-y-5"><div className="rounded-lg border bg-muted/40 p-4"><CheckCircle2 className="mb-3 size-8 text-emerald-600" /><p className="font-medium" role="status">{t(datos.local ? "Solicitud guardada en el entorno local" : "Solicitud enviada a la empresa")}</p><p className="mt-2 text-sm text-muted-foreground">{t(datos.local ? "El equipo puede consultarla en Mi empresa. No se han enviado mensajes ni correos externos." : "El equipo de la empresa revisará los detalles de tu proyecto.")}</p></div><Button className="w-full" onClick={() => setAbierto(false)}>{t("Volver al perfil")}</Button></div> : <form onSubmit={enviar} className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm"><span className="block text-xs text-muted-foreground">{t("Proveedor del servicio")}</span><strong>{datos.empresa.razonSocial}</strong></div>
          <div className="space-y-2"><Label htmlFor="solicitud-empresa-titulo">{t("¿Qué necesitas?")}</Label><Input id="solicitud-empresa-titulo" name="titulo" placeholder={t("Por ejemplo, reformar un baño")} required minLength={8} maxLength={140} disabled={guardando} /></div>
          <div className="space-y-2"><Label htmlFor="solicitud-empresa-descripcion">{t("Detalles del proyecto")}</Label><Textarea id="solicitud-empresa-descripcion" name="descripcion" placeholder={t("Describe el trabajo, la zona y cuándo te gustaría realizarlo.")} className="min-h-32" required minLength={20} maxLength={2000} disabled={guardando} /></div>
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t(error)}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{t("Pedir presupuesto no confirma una contratación ni genera un pago.")}</p>
          <Button type="submit" className="w-full" disabled={guardando}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{t(guardando ? "Guardando..." : "Enviar solicitud")}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </>
}

export default function PerfilEmpresa({ datos, vistaPrevia = false, integrado = false }: {
  datos: EmpresaPublica
  vistaPrevia?: boolean
  integrado?: boolean
}) {
  const t = useT()
  const { idioma } = useIdioma()
  return <div className={integrado ? "min-w-0" : "container mx-auto px-4 py-8"}>
    <PerfilProfesionalPublico
      perfil={perfilProfesionalDeEmpresa(datos, localeDe(idioma))}
      empresa={{
        equipo: <EquipoEmpresa datos={datos} />,
        acciones: datos.local || vistaPrevia
          ? <SolicitarPresupuestoEmpresa datos={datos} vistaPrevia={vistaPrevia} className="flex-1 sm:flex-none" />
          : <ContactarEmpresa datos={datos} texto="Enviar mensaje" className="flex-1 sm:flex-none" />,
        vistaPrevia,
      }}
    />
    {vistaPrevia && <p id="empresa-vista-previa-contacto" className="sr-only">{t("Los botones de contacto están desactivados en esta vista previa.")}</p>}
  </div>
}
