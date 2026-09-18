"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CheckCircle2, ChevronRight, ClipboardList, ExternalLink, Globe, Hammer, Loader2, MapPin, MessageSquare, Star, Users } from "lucide-react"
import { solicitarPresupuestoEmpresa } from "@/app/actions/empresa-workspace"
import { useIdioma, useT } from "@/components/idioma-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { localeDe } from "@/lib/i18n"
import type { EmpresaPublica, TrabajoEmpresa } from "@/lib/empresas/types"

export function webPublicaSegura(web: string): string | null {
  try {
    const url = new URL(web)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function InicialesEmpresa({ nombre, className = "" }: { nombre: string; className?: string }) {
  return <Avatar className={className}><AvatarFallback className="bg-muted text-foreground">{nombre.split(" ").filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("")}</AvatarFallback></Avatar>
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
        {trabajo.imagen?.startsWith("/images/empresas-local/") ? <Image src={trabajo.imagen} alt={t("Ilustración del proyecto: {titulo}", { titulo: trabajo.titulo })} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" unoptimized /> : <Hammer className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />}
        <span className="absolute bottom-3 left-3 rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground">{t(trabajo.imagen?.startsWith("/images/empresas-local/") ? "Ilustración del proyecto" : "Proyecto sin fotografías")}</span>
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

export function SolicitarPresupuestoEmpresa({ datos, className }: { datos: EmpresaPublica; className?: string }) {
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

export default function PerfilEmpresa({ datos }: { datos: EmpresaPublica }) {
  const t = useT()
  const { empresa, miembros, trabajos, resenas } = datos
  const [verificacionAbierta, setVerificacionAbierta] = useState(false)
  const rating = resenas.length ? resenas.reduce((suma, resena) => suma + resena.puntuacion, 0) / resenas.length : null
  const web = webPublicaSegura(empresa.web)

  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <nav aria-label={t("Navegación del perfil")} className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Link href="/profesionales" className="flex shrink-0 items-center gap-1.5 hover:text-foreground"><ArrowLeft className="size-4" />{t("Profesionales")}</Link>
      <ChevronRight className="size-3.5 shrink-0" /><span className="truncate">{empresa.nombre}</span>
    </nav>

    <Card className="overflow-hidden">
      <div className="relative h-32 bg-gradient-to-r from-primary/20 to-primary/5 sm:h-44" />
      <CardContent className="pt-0">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row">
          <Avatar className="relative size-24 shrink-0 border-4 border-background shadow-lg sm:size-28"><AvatarFallback className="bg-muted"><Building2 className="size-10 text-muted-foreground" /></AvatarFallback></Avatar>
          <div className="min-w-0 flex-1 sm:pt-14">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-bold">{empresa.nombre}</h1>
              <Badge variant="secondary">{t("Empresa")}</Badge>
              {empresa.estadoVerificacion === "verificada" && <button type="button" onClick={() => setVerificacionAbierta(true)} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><BadgeCheck className="size-3.5" />{t("Empresa verificada")}</Badge></button>}
            </div>
            <p className="mt-1 text-muted-foreground">{empresa.servicios.join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="size-4" />{empresa.ubicacion}</span>
              {rating !== null ? <span className="flex items-center gap-1"><Star className="size-4 fill-amber-500 text-amber-500" /><strong className="text-foreground">{rating.toFixed(1)}</strong>({resenas.length} {t("valoraciones")})</span> : <span>{t("Todavía sin valoraciones")}</span>}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <SolicitarPresupuestoEmpresa datos={datos} className="w-full sm:w-auto" />
          {web && <Button asChild variant="outline" className="w-full bg-transparent sm:w-auto"><a href={web} target="_blank" rel="noopener noreferrer"><Globe className="size-4" />{t("Web corporativa")}<ExternalLink className="size-3.5" /><span className="sr-only">{t("Se abre en otra pestaña")}</span></a></Button>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("Proveedor del servicio: {empresa} · Te atienden las personas autorizadas de su equipo.", { empresa: empresa.razonSocial })}</p>
      </CardContent>
    </Card>

    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <Card><CardContent className="px-2 text-center"><ClipboardList className="mx-auto mb-1 size-5 text-muted-foreground" /><p className="text-xl font-bold">{trabajos.length}</p><p className="text-xs text-muted-foreground">{t("Trabajos")}</p></CardContent></Card>
      <Card><CardContent className="px-2 text-center"><Users className="mx-auto mb-1 size-5 text-muted-foreground" /><p className="text-xl font-bold">{miembros.length}</p><p className="text-xs text-muted-foreground">{t("Miembros")}</p></CardContent></Card>
      <Card><CardContent className="px-2 text-center"><Star className="mx-auto mb-1 size-5 text-amber-500" /><p className="text-xl font-bold">{rating?.toFixed(1) ?? "—"}</p><p className="text-xs text-muted-foreground">{t("Valoración")}</p></CardContent></Card>
    </div>

    <Tabs defaultValue="empresa" className="w-full">
      <TabsList className="grid w-full grid-cols-4"><TabsTrigger value="empresa" className="px-1 text-xs sm:text-sm">{t("Empresa")}</TabsTrigger><TabsTrigger value="trabajos" className="px-1 text-xs sm:text-sm">{t("Trabajos")}</TabsTrigger><TabsTrigger value="resenas" className="px-1 text-xs sm:text-sm">{t("Valoraciones")}</TabsTrigger><TabsTrigger value="equipo" className="px-1 text-xs sm:text-sm">{t("Equipo")}</TabsTrigger></TabsList>
      <TabsContent value="empresa" className="space-y-4">
        <Card><CardContent className="space-y-6">
          <section><h2 className="mb-2 font-semibold">{t("Descripción")}</h2><p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{empresa.descripcion || t("La empresa todavía no ha añadido su presentación.")}</p></section>
          <section><h2 className="mb-2 font-semibold">{t("Servicios")}</h2><div className="flex flex-wrap gap-2">{empresa.servicios.map((servicio) => <Badge key={servicio} variant="secondary" className="max-w-full whitespace-normal">{servicio}</Badge>)}</div></section>
          <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
            <div><h2 className="mb-2 font-semibold">{t("Zona de trabajo")}</h2><p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" />{empresa.ubicacion}</p></div>
            {web && <div className="min-w-0"><h2 className="mb-2 font-semibold">{t("Web corporativa")}</h2><a href={web} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 text-sm text-primary hover:underline"><Globe className="mt-0.5 size-4 shrink-0" /><span className="break-all">{new URL(web).hostname.replace(/^www\./, "")}</span><ExternalLink className="mt-0.5 size-3.5 shrink-0" /><span className="sr-only">{t("Se abre en otra pestaña")}</span></a></div>}
          </div>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="trabajos" className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("Trabajos realizados por {empresa}.", { empresa: empresa.nombre })}</p>
        {trabajos.length ? <div className="grid gap-4 sm:grid-cols-2">{trabajos.map((trabajo) => <TrabajoEmpresaCard key={trabajo.id} trabajo={trabajo} />)}</div> : <EstadoVacio icono="trabajos" titulo={t("Todavía no hay trabajos publicados")} descripcion={t("La empresa podrá mostrar aquí sus proyectos terminados.")} />}
      </TabsContent>
      <TabsContent value="resenas" className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("Valoraciones de servicios contratados a esta empresa.")}</p>
        {resenas.length ? resenas.map((resena) => <Card key={resena.id}><CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><InicialesEmpresa nombre={resena.autor} className="size-10" /><div><h3 className="text-sm font-medium">{resena.autor}</h3><p className="text-xs text-muted-foreground"><Fecha fecha={resena.fecha} /></p></div></div><span className="flex gap-0.5" aria-label={t("{cantidad} de 5 estrellas", { cantidad: resena.puntuacion })}>{Array.from({ length: 5 }, (_, indice) => <Star key={indice} className={`size-4 ${indice < resena.puntuacion ? "fill-amber-500 text-amber-500" : "text-muted-foreground/25"}`} />)}</span></div>
          <p className="mt-4 text-sm leading-relaxed">{resena.comentario}</p><p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5 shrink-0" />{trabajos.find((trabajo) => trabajo.id === resena.trabajoId)?.titulo || t("Servicio de la empresa")}</p>
        </CardContent></Card>) : <EstadoVacio icono="resenas" titulo={t("Todavía no hay valoraciones")} descripcion={t("Las valoraciones de sus clientes aparecerán aquí.")} />}
      </TabsContent>
      <TabsContent value="equipo" className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("Profesionales que actúan en nombre de la empresa.")}</p>
        {miembros.length ? <div className="grid gap-4 sm:grid-cols-2">{miembros.map((miembro) => <Link key={miembro.id} href={`/profesional/${encodeURIComponent(miembro.usuarioId)}`} className="group rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-center gap-3"><InicialesEmpresa nombre={miembro.nombre} className="size-12 shrink-0" /><div className="min-w-0"><h3 className="font-semibold group-hover:text-primary">{miembro.nombre}</h3><p className="text-sm text-muted-foreground">{miembro.cargo}</p></div></div><p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{miembro.bio}</p><span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">{t("Ver perfil")}<ArrowRight className="size-4" /></span>
        </Link>)}</div> : <EstadoVacio icono="equipo" titulo={t("El equipo todavía no es público")} descripcion={t("Puedes solicitar un presupuesto directamente a la empresa.")} />}
      </TabsContent>
    </Tabs>
    <Dialog open={verificacionAbierta} onOpenChange={setVerificacionAbierta}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2 pr-5"><BadgeCheck className="size-5 shrink-0 text-emerald-600" />{t("Qué significa «Empresa verificada»")}</DialogTitle><DialogDescription>{t("Identidad de la empresa y representación comprobadas.")}</DialogDescription></DialogHeader><p className="text-sm leading-relaxed">{t("Se han revisado los datos de la empresa y la autorización de la persona responsable de su cuenta en Diime. Este distintivo no certifica la calidad del servicio: consulta sus trabajos y las reseñas de sus clientes.")}</p>{datos.local && <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">{t("En este entorno local la verificación es una simulación. No acredita a una empresa real.")}</p>}<Button variant="outline" onClick={() => setVerificacionAbierta(false)}>{t("Entendido")}</Button></DialogContent></Dialog>
  </div>
}

function EstadoVacio({ icono, titulo, descripcion }: { icono: "trabajos" | "resenas" | "equipo"; titulo: string; descripcion: string }) {
  const Icono = icono === "trabajos" ? ClipboardList : icono === "resenas" ? Star : Users
  return <Card><CardContent className="py-8 text-center"><Icono className="mx-auto mb-3 size-7 text-muted-foreground" /><h3 className="text-sm font-medium">{titulo}</h3><p className="mt-2 text-sm text-muted-foreground">{descripcion}</p></CardContent></Card>
}
