"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Mail, RefreshCw, ExternalLink, CheckCircle, Clock, XCircle, UserPlus } from "lucide-react"
import { buscarYEnviarInvitaciones } from "@/app/actions/invitaciones"
import { toast } from "@/hooks/use-toast"

interface Invitacion {
  id: string
  solicitud_id: string
  nombre_empresa: string
  email: string
  sitio_web: string | null
  estado: "pendiente" | "enviada" | "abierta" | "registrado" | "error"
  token_invitacion: string
  fecha_envio: string | null
  created_at: string
  solicitud?: {
    titulo: string
    categoria?: {
      nombre: string
    }
  }
}

export default function AdminInvitacionesPage() {
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchInvitaciones()
  }, [])

  const fetchInvitaciones = async () => {
    setIsLoading(true)
    const { data, error } = await supabase
      .from("invitaciones")
      .select(`
        *,
        solicitud:solicitudes(
          titulo,
          categoria:categorias(nombre)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      console.error("[v0] Error fetching invitaciones:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar las invitaciones",
      })
    } else {
      setInvitaciones(data || [])
    }
    setIsLoading(false)
  }

  const reenviarInvitacion = async (solicitudId: string) => {
    setProcessingId(solicitudId)
    try {
      const result = await buscarYEnviarInvitaciones(solicitudId)
      if (result.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        })
      } else {
        toast({
          title: "Invitaciones enviadas",
          description: `Se enviaron ${result.invitacionesEnviadas} invitaciones`,
        })
        fetchInvitaciones()
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error al enviar las invitaciones",
      })
    }
    setProcessingId(null)
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "enviada":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Mail className="w-3 h-3 mr-1" /> Enviada</Badge>
      case "abierta":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Abierta</Badge>
      case "registrado":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Registrado</Badge>
      case "error":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>
      default:
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200"><Clock className="w-3 h-3 mr-1" /> Pendiente</Badge>
    }
  }

  // Group invitations by solicitud
  const invitacionesPorSolicitud = invitaciones.reduce((acc, inv) => {
    const key = inv.solicitud_id
    if (!acc[key]) {
      acc[key] = {
        solicitud: inv.solicitud,
        invitaciones: [],
      }
    }
    acc[key].invitaciones.push(inv)
    return acc
  }, {} as Record<string, { solicitud: Invitacion["solicitud"]; invitaciones: Invitacion[] }>)

  // Stats
  const totalInvitaciones = invitaciones.length
  const enviadas = invitaciones.filter((i) => i.estado === "enviada").length
  const registrados = invitaciones.filter((i) => i.estado === "registrado").length
  const tasaConversion = totalInvitaciones > 0 ? ((registrados / totalInvitaciones) * 100).toFixed(1) : "0"

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Invitaciones a Proveedores</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las invitaciones enviadas por IA a proveedores externos
          </p>
        </div>
        <Button onClick={fetchInvitaciones} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Invitaciones</CardDescription>
            <CardTitle className="text-3xl">{totalInvitaciones}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enviadas</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{enviadas}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registrados</CardDescription>
            <CardTitle className="text-3xl text-green-600">{registrados}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tasa de Conversión</CardDescription>
            <CardTitle className="text-3xl">{tasaConversion}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Invitations by Solicitud */}
      <div className="space-y-6">
        {Object.entries(invitacionesPorSolicitud).map(([solicitudId, { solicitud, invitaciones: invs }]) => (
          <Card key={solicitudId}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{solicitud?.titulo || "Solicitud sin título"}</CardTitle>
                  <CardDescription>
                    {solicitud?.categoria?.nombre || "Sin categoría"} • {invs.length} proveedores encontrados
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reenviarInvitacion(solicitudId)}
                  disabled={processingId === solicitudId}
                >
                  {processingId === solicitudId ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Buscar más proveedores
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {invs.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{inv.nombre_empresa}</p>
                      <p className="text-sm text-muted-foreground">{inv.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {inv.sitio_web && (
                        <a
                          href={inv.sitio_web}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {getEstadoBadge(inv.estado)}
                      {inv.fecha_envio && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(inv.fecha_envio).toLocaleDateString("es-ES")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {Object.keys(invitacionesPorSolicitud).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay invitaciones todavía</h3>
              <p className="text-muted-foreground">
                Las invitaciones se generarán automáticamente cuando se publiquen nuevas demandas
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
