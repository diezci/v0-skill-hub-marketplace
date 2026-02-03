"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle2, XCircle, Loader2, Calendar, MapPin, Euro, User, FileText, AlertCircle } from "lucide-react"
import { obtenerMisTrabajos, actualizarEstadoTrabajo } from "@/app/actions/trabajos"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type EstadoTrabajo = "en_progreso" | "completado" | "cancelado"

const estadoConfig: Record<
  EstadoTrabajo,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }
> = {
  en_progreso: {
    label: "En Progreso",
    variant: "default",
    icon: Loader2,
  },
  completado: {
    label: "Completado",
    variant: "outline",
    icon: CheckCircle2,
  },
  cancelado: {
    label: "Cancelado",
    variant: "destructive",
    icon: XCircle,
  },
}

export default function MisTrabajos() {
  const [filtroEstado, setFiltroEstado] = useState<EstadoTrabajo | "todos">("todos")
  const [trabajos, setTrabajos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    async function cargarTrabajos() {
      setLoading(true)
      const result = await obtenerMisTrabajos()
      if (result.data) {
        setTrabajos(result.data)
      }
      setLoading(false)
    }
    cargarTrabajos()
  }, [])

  const handleMarcarCompletado = async (trabajoId: string) => {
    const result = await actualizarEstadoTrabajo(trabajoId, "completado")
    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Trabajo completado",
        description: "El trabajo ha sido marcado como completado",
      })
      setTrabajos(trabajos.map((t) => (t.id === trabajoId ? { ...t, estado: "completado" } : t)))
    }
  }

  const trabajosFiltrados = filtroEstado === "todos" ? trabajos : trabajos.filter((t) => t.estado === filtroEstado)

  const contadores = {
    todos: trabajos.length,
    en_progreso: trabajos.filter((t) => t.estado === "en_progreso").length,
    completado: trabajos.filter((t) => t.estado === "completado").length,
    cancelado: trabajos.filter((t) => t.estado === "cancelado").length,
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mis Trabajos</CardTitle>
          <CardDescription>Gestiona todos tus trabajos activos y completados</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="todos" className="space-y-6" onValueChange={(v) => setFiltroEstado(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="todos">
                Todos
                <Badge variant="secondary" className="ml-2">
                  {contadores.todos}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="en_progreso">
                En Progreso
                <Badge variant="secondary" className="ml-2">
                  {contadores.en_progreso}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completado">
                Completados
                <Badge variant="secondary" className="ml-2">
                  {contadores.completado}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cancelado">
                Cancelados
                <Badge variant="secondary" className="ml-2">
                  {contadores.cancelado}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filtroEstado} className="space-y-4">
              {trabajosFiltrados.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      No tienes trabajos{" "}
                      {filtroEstado !== "todos" && `en estado "${estadoConfig[filtroEstado as EstadoTrabajo]?.label}"`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                trabajosFiltrados.map((trabajo) => {
                  const config = estadoConfig[trabajo.estado as EstadoTrabajo]
                  const IconoEstado = config.icon

                  return (
                    <Card key={trabajo.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <CardTitle className="text-xl">{trabajo.solicitud?.titulo}</CardTitle>
                                <CardDescription className="mt-1">
                                  {trabajo.solicitud?.categoria?.nombre || "Categoría no especificada"}
                                </CardDescription>
                              </div>
                            </div>
                          </div>
                          <Badge variant={config.variant} className="gap-1.5 self-start">
                            <IconoEstado className="h-3.5 w-3.5" />
                            {config.label}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">{trabajo.solicitud?.descripcion}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Iniciado: {new Date(trabajo.created_at).toLocaleDateString("es-ES")}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{trabajo.solicitud?.ubicacion}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Euro className="h-4 w-4" />
                            <span className="font-semibold text-foreground">{trabajo.oferta?.precio}€</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>
                              {trabajo.profesional?.nombre} {trabajo.profesional?.apellido}
                            </span>
                          </div>
                        </div>

                        {trabajo.transaccion_escrow && (
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                            <AlertCircle className="h-4 w-4 text-primary" />
                            <span className="text-sm">
                              Pago protegido con Escrow - Estado: {trabajo.transaccion_escrow.estado}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-2">
                          {trabajo.estado === "en_progreso" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="default" size="sm" className="gap-2">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Marcar como Completado
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Marcar trabajo como completado?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción notificará al cliente que el trabajo está completado. Si hay un pago en
                                    escrow, el cliente podrá liberar los fondos.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleMarcarCompletado(trabajo.id)}>
                                    Confirmar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {trabajo.estado === "completado" && !trabajo.review && (
                            <Button variant="outline" size="sm">
                              Dejar Valoración
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
