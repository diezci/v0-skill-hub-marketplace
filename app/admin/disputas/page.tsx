"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Scale,
  ArrowLeft,
  MessageSquare,
  Paperclip,
  Clock,
  ShieldCheck,
  User,
  Wrench,
  Euro,
} from "lucide-react"
import { obtenerDisputas, obtenerDetalleDisputa, resolverDisputa } from "@/app/actions/disputes"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { formatearFecha } from "@/lib/utils"

const ESTADO_TRABAJO: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  en_progreso: "En progreso",
  entregado: "Entregado",
  completado: "Completado",
  rechazado: "Rechazado",
  en_disputa: "En disputa",
}

function fechaHora(d: string) {
  return new Date(d).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export default function AdminDisputesPage() {
  const [disputas, setDisputas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detalle, setDetalle] = useState<any>(null)
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [resolucion, setResolucion] = useState<"cliente" | "proveedor" | "parcial" | "">("")
  const [nota, setNota] = useState("")
  const [montoParcial, setMontoParcial] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    cargarDisputas()
  }, [])

  const cargarDisputas = async () => {
    setLoading(true)
    const result = await obtenerDisputas()
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
      if (result.error.includes("permiso") || result.error.includes("autenticado")) router.push("/")
    } else {
      setDisputas(result.data || [])
    }
    setLoading(false)
  }

  const abrirDetalle = async (disputaId: string) => {
    setLoadingDetalle(true)
    setResolucion("")
    setNota("")
    setMontoParcial("")
    const result = await obtenerDetalleDisputa(disputaId)
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      setDetalle(result.data)
    }
    setLoadingDetalle(false)
  }

  const handleResolver = async () => {
    if (!detalle || !resolucion || !nota.trim()) {
      toast({ title: "Faltan datos", description: "Elige una resolución y escribe la justificación.", variant: "destructive" })
      return
    }
    setIsSubmitting(true)
    const result = await resolverDisputa({
      disputa_id: detalle.disputa.id,
      resolucion: resolucion as "cliente" | "proveedor" | "parcial",
      nota,
      monto_reembolso: resolucion === "parcial" ? Number.parseFloat(montoParcial) : undefined,
    })
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Disputa resuelta", description: "Se ha aplicado la resolución y el movimiento de fondos." })
      setDetalle(null)
      cargarDisputas()
    }
    setIsSubmitting(false)
  }

  const disputasAbiertas = disputas.filter((d) => d.estado === "abierta")
  const disputasResueltas = disputas.filter((d) => d.estado === "resuelta")

  // ---------- Vista de detalle ----------
  if (detalle) {
    const { disputa, trabajo, cliente, profesional, escrow, solicitud, oferta, mensajes, actualizaciones } = detalle
    const base = Number(escrow?.monto_base ?? trabajo?.precio_acordado ?? 0)
    const archivosSolicitud: string[] = Array.isArray(solicitud?.archivos) ? solicitud.archivos : []
    const archivosOferta: string[] = Array.isArray(oferta?.archivos) ? oferta.archivos : []
    const archivosActualizaciones: string[] = (actualizaciones || []).flatMap((a: any) => a.archivos || [])
    const todasPruebas = [...archivosSolicitud, ...archivosOferta, ...archivosActualizaciones]

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Button variant="ghost" className="gap-2" onClick={() => setDetalle(null)}>
            <ArrowLeft className="h-4 w-4" /> Volver a disputas
          </Button>

          {/* Cabecera */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Scale className="h-6 w-6 text-primary" />
                {trabajo?.titulo}
              </h1>
              <p className="text-muted-foreground mt-1">
                Disputa iniciada por el {disputa.tipo === "cliente" ? "cliente" : "proveedor"} ·{" "}
                {formatearFecha(disputa.created_at)}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                disputa.estado === "abierta"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
              }
            >
              {disputa.estado === "abierta" ? "Abierta" : "Resuelta"}
            </Badge>
          </div>

          {/* Partes + escrow */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" /> Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={cliente?.foto_perfil || "/placeholder.svg"} />
                  <AvatarFallback>{cliente?.nombre?.[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">{cliente?.nombre} {cliente?.apellido}</p>
                  <p className="text-xs text-muted-foreground truncate">{cliente?.email}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Wrench className="h-4 w-4" /> Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profesional?.foto_perfil || "/placeholder.svg"} />
                  <AvatarFallback>{profesional?.nombre?.[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">{profesional?.nombre} {profesional?.apellido}</p>
                  <p className="text-xs text-muted-foreground truncate">{profesional?.email}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Pago en custodia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{base.toFixed(2)} €</p>
                <p className="text-xs text-muted-foreground">
                  Estado escrow: <span className="font-medium">{escrow?.estado || "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Trabajo: {ESTADO_TRABAJO[trabajo?.estado] || trabajo?.estado}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Motivo */}
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" /> Motivo de la disputa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{disputa.motivo}</p>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Conversación */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Conversación cliente ↔ proveedor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {mensajes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No hay mensajes registrados.</p>
                )}
                {mensajes.map((m: any) => {
                  const esCliente = m.remitente_id === cliente?.id
                  return (
                    <div key={m.id} className={`flex ${esCliente ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          esCliente ? "bg-muted" : "bg-primary/10"
                        }`}
                      >
                        <p className="text-[11px] font-medium mb-0.5 text-muted-foreground">
                          {esCliente ? cliente?.nombre : profesional?.nombre} · {fechaHora(m.created_at)}
                        </p>
                        {m.contenido}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Historial / timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Historial del trabajo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                {(actualizaciones || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin actualizaciones registradas.</p>
                )}
                {actualizaciones.map((a: any) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center pt-1">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <div className="w-px flex-1 bg-border" />
                    </div>
                    <div className="pb-2">
                      <p className="text-xs text-muted-foreground">{fechaHora(a.created_at)} · {a.tipo}</p>
                      <p>{a.mensaje}</p>
                      {a.archivos?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {a.archivos.map((src: string, i: number) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={src || "/placeholder.svg"}
                              alt="prueba"
                              className="h-16 w-16 rounded object-cover border"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Pruebas / archivos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Pruebas y archivos adjuntos ({todasPruebas.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todasPruebas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No se han adjuntado archivos.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {todasPruebas.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src || "/placeholder.svg"} alt="prueba" className="h-24 w-24 rounded-lg object-cover border hover:opacity-80 transition" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Panel de resolución */}
          {disputa.estado === "abierta" ? (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resolver disputa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { v: "cliente", label: "Reembolsar al cliente", desc: `Devolver ${base.toFixed(2)} €` },
                    { v: "proveedor", label: "Liberar al proveedor", desc: "Pagar el trabajo" },
                    { v: "parcial", label: "Reembolso parcial", desc: "Repartir el importe" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setResolucion(opt.v as any)}
                      className={`text-left rounded-lg border p-3 transition ${
                        resolucion === opt.v ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
                      }`}
                    >
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        <Euro className="h-4 w-4" /> {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                    </button>
                  ))}
                </div>

                {resolucion === "parcial" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Importe a reembolsar al cliente (€)</label>
                    <Input
                      type="number"
                      max={base}
                      min={0}
                      value={montoParcial}
                      onChange={(e) => setMontoParcial(e.target.value)}
                      placeholder={`Máx. ${base.toFixed(2)}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      El resto ({(base - (Number.parseFloat(montoParcial) || 0)).toFixed(2)} €) se considera a favor del proveedor.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Justificación de la resolución *</label>
                  <Textarea
                    rows={3}
                    placeholder="Explica la decisión basándote en la conversación y las pruebas..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>

                {(resolucion === "cliente" || resolucion === "parcial") && escrow?.stripe_payment_intent_id && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3 text-sm text-blue-700 dark:text-blue-300">
                    Se ejecutará un reembolso real en Stripe sobre el pago original.
                  </div>
                )}

                <Button onClick={handleResolver} disabled={isSubmitting || !resolucion || !nota.trim()} className="w-full">
                  {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Aplicar resolución
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Disputa resuelta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Resolución:{" "}
                  <span className="font-medium">
                    {disputa.resolucion === "cliente"
                      ? "Reembolso al cliente"
                      : disputa.resolucion === "proveedor"
                        ? "Pago liberado al proveedor"
                        : "Reembolso parcial"}
                  </span>
                </p>
                <p className="text-muted-foreground">{disputa.resultado}</p>
                {disputa.fecha_resolucion && (
                  <p className="text-xs text-muted-foreground">Resuelta el {formatearFecha(disputa.fecha_resolucion)}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ---------- Vista de lista ----------
  const renderLista = (lista: any[]) =>
    lista.length === 0 ? (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">No hay disputas en esta sección.</CardContent>
      </Card>
    ) : (
      lista.map((d) => (
        <Card key={d.id} className={d.estado === "abierta" ? "border-amber-500/20" : "border-emerald-500/20"}>
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {d.estado === "abierta" ? (
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
                <p className="font-semibold truncate">{d.trabajo?.titulo || "Trabajo"}</p>
              </div>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {d.cliente?.nombre} {d.cliente?.apellido} vs {d.profesional?.nombre} {d.profesional?.apellido} ·{" "}
                {d.trabajo?.precio_acordado} €
              </p>
              <p className="text-xs text-muted-foreground">{formatearFecha(d.created_at)}</p>
            </div>
            <Button onClick={() => abrirDetalle(d.id)} disabled={loadingDetalle}>
              {d.estado === "abierta" ? "Revisar y resolver" : "Ver detalle"}
            </Button>
          </CardContent>
        </Card>
      ))
    )

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Scale className="h-8 w-8 text-primary" /> Centro de Disputas
          </h1>
          <p className="text-muted-foreground mt-1">
            Revisa la conversación y las pruebas, y resuelve liberando o reembolsando los fondos.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Abiertas</p>
              <p className="text-2xl font-bold text-amber-600">{disputasAbiertas.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Resueltas</p>
              <p className="text-2xl font-bold text-emerald-600">{disputasResueltas.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Tasa resolución</p>
              <p className="text-2xl font-bold">
                {disputas.length > 0 ? Math.round((disputasResueltas.length / disputas.length) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <Card>
            <CardContent className="pt-6 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando disputas...
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="abiertas" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="abiertas">Abiertas ({disputasAbiertas.length})</TabsTrigger>
              <TabsTrigger value="resueltas">Resueltas ({disputasResueltas.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="abiertas" className="space-y-4">
              {renderLista(disputasAbiertas)}
            </TabsContent>
            <TabsContent value="resueltas" className="space-y-4">
              {renderLista(disputasResueltas)}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
