"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, CheckCircle2, Loader2, Scale, DollarSign } from "lucide-react"
import { obtenerDisputas, resolverDisputa } from "@/app/actions/disputes"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { formatearFecha } from "@/lib/utils"

export default function AdminDisputesPage() {
  const [disputas, setDisputas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDisputa, setSelectedDisputa] = useState<any>(null)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [resolucion, setResolucion] = useState<"cliente" | "proveedor" | "reembolso_parcial" | "">("")
  const [descripcion, setDescripcion] = useState("")
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
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      router.push("/")
    } else {
      setDisputas(result.data || [])
    }
    setLoading(false)
  }

  const handleResolverDisputa = async () => {
    if (!selectedDisputa || !resolucion || !descripcion.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    const result = await resolverDisputa({
      disputa_id: selectedDisputa.id,
      resolucion: resolucion as "cliente" | "proveedor" | "reembolso_parcial",
      descripcion,
    })

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Disputa resuelta",
        description: `La disputa ha sido resuelta a favor del ${
          resolucion === "cliente" ? "cliente" : resolucion === "proveedor" ? "proveedor" : "ambas partes"
        }`,
      })
      setShowResolveDialog(false)
      setSelectedDisputa(null)
      setResolucion("")
      setDescripcion("")
      cargarDisputas()
    }
    setIsSubmitting(false)
  }

  const disputasAbiertas = disputas.filter((d) => d.estado === "abierta")
  const disputasResueltas = disputas.filter((d) => d.estado === "resuelta")

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Scale className="h-8 w-8 text-primary" />
            Centro de Disputas
          </h1>
          <p className="text-muted-foreground mt-1">
            Resuelve disputas entre clientes y proveedores
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Disputas Abiertas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{disputasAbiertas.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Pendientes de resolucion</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resueltas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">{disputasResueltas.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total resueltas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tasa de resolucion</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {disputas.length > 0
                  ? Math.round((disputasResueltas.length / disputas.length) * 100)
                  : 0}
                %
              </p>
              <p className="text-xs text-muted-foreground mt-1">Disputas cerradas</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="abiertas" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="abiertas">Disputas Abiertas ({disputasAbiertas.length})</TabsTrigger>
            <TabsTrigger value="resueltas">Resueltas ({disputasResueltas.length})</TabsTrigger>
          </TabsList>

          {/* Open Disputes */}
          <TabsContent value="abiertas" className="space-y-4">
            {loading ? (
              <Card>
                <CardContent className="pt-6 flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando disputas...</span>
                </CardContent>
              </Card>
            ) : disputasAbiertas.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <p>No hay disputas abiertas</p>
                </CardContent>
              </Card>
            ) : (
              disputasAbiertas.map((disputa) => (
                <Card key={disputa.id} className="border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-amber-500" />
                          <CardTitle>{disputa.trabajos?.titulo}</CardTitle>
                        </div>
                        <CardDescription className="mt-2">
                          <span className="font-medium">Razon:</span> {disputa.razon}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                        {disputa.tipo === "cliente" ? "Iniciado por cliente" : "Iniciado por proveedor"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-background p-4 rounded-lg border">
                      <p className="text-sm font-medium mb-2">Descripcion de la disputa:</p>
                      <p className="text-sm text-muted-foreground">{disputa.descripcion}</p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Precio acordado</p>
                        <p className="font-bold">{disputa.trabajos?.precio_acordado} EUR</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Estado del trabajo</p>
                        <p className="font-bold capitalize">{disputa.trabajos?.estado}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fecha de apertura</p>
                        <p className="font-bold">{formatearFecha(disputa.created_at)}</p>
                      </div>
                    </div>

                    <Dialog open={showResolveDialog && selectedDisputa?.id === disputa.id} onOpenChange={setShowResolveDialog}>
                      <DialogTrigger asChild>
                        <Button
                          onClick={() => setSelectedDisputa(disputa)}
                          className="w-full"
                        >
                          Resolver Disputa
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Resolver Disputa</DialogTitle>
                          <DialogDescription>
                            {disputa.trabajos?.titulo}
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Resolucion *</label>
                            <Select value={resolucion} onValueChange={(value) => setResolucion(value as any)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona una resolucion" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cliente">
                                  <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-green-600" />
                                    Reembolso completo al cliente
                                  </div>
                                </SelectItem>
                                <SelectItem value="proveedor">
                                  <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-green-600" />
                                    Pago completo al proveedor
                                  </div>
                                </SelectItem>
                                <SelectItem value="reembolso_parcial">
                                  <div className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-yellow-600" />
                                    50/50 - Reembolso/Pago
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Justificacion *</label>
                            <Textarea
                              placeholder="Explica la razon de esta resolucion..."
                              value={descripcion}
                              onChange={(e) => setDescripcion(e.target.value)}
                              rows={4}
                            />
                          </div>

                          {resolucion === "cliente" && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                              <p className="text-sm text-green-700 font-medium">
                                Se reembolsara {disputa.trabajos?.precio_acordado} EUR al cliente
                              </p>
                            </div>
                          )}
                          {resolucion === "proveedor" && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                              <p className="text-sm text-green-700 font-medium">
                                Se pagara {disputa.trabajos?.precio_acordado} EUR al proveedor
                              </p>
                            </div>
                          )}
                          {resolucion === "reembolso_parcial" && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                              <p className="text-sm text-yellow-700 font-medium">
                                Se dividira el pago: {(disputa.trabajos?.precio_acordado / 2).toFixed(2)} EUR al cliente y {(disputa.trabajos?.precio_acordado / 2).toFixed(2)} EUR al proveedor
                              </p>
                            </div>
                          )}
                        </div>

                        <DialogFooter className="gap-2">
                          <Button
                            variant="outline"
                            className="bg-transparent"
                            onClick={() => {
                              setShowResolveDialog(false)
                              setResolucion("")
                              setDescripcion("")
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            onClick={handleResolverDisputa}
                            disabled={isSubmitting || !resolucion || !descripcion.trim()}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Resolviendo...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Resolver
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Resolved Disputes */}
          <TabsContent value="resueltas" className="space-y-4">
            {loading ? (
              <Card>
                <CardContent className="pt-6 flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando disputas...</span>
                </CardContent>
              </Card>
            ) : disputasResueltas.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <p>No hay disputas resueltas</p>
                </CardContent>
              </Card>
            ) : (
              disputasResueltas.map((disputa) => (
                <Card key={disputa.id} className="border-emerald-500/20 bg-emerald-500/5">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <CardTitle>{disputa.trabajos?.titulo}</CardTitle>
                        </div>
                        <CardDescription className="mt-2">
                          Resolucion: {disputa.resolucion === "cliente" ? "Reembolso completo al cliente" : disputa.resolucion === "proveedor" ? "Pago completo al proveedor" : "50/50 Split"}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                        Resuelta
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-background p-4 rounded-lg border">
                      <p className="text-sm font-medium mb-2">Justificacion de resolucion:</p>
                      <p className="text-sm text-muted-foreground">{disputa.descripcion_resolucion}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Resuelto el {formatearFecha(disputa.updated_at)}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
