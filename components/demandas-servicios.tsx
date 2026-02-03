"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  MapPin,
  Clock,
  Send,
  Paperclip,
  X,
  Filter,
  Users,
  Search,
  SlidersHorizontal,
  AlertCircle,
  Eye,
  MessageSquare,
  Loader2,
} from "lucide-react"
import { uploadFile } from "@/lib/upload-helpers"
import { toast } from "@/hooks/use-toast"
import { crearOferta } from "@/app/actions/ofertas"
import { obtenerSolicitudesAbiertas } from "@/app/actions/solicitudes"
import { cn } from "@/lib/utils"

type Demanda = {
  id: string
  titulo: string
  descripcion: string
  categoria: { nombre: string }
  cliente: { nombre: string; apellido: string; foto_perfil?: string }
  ubicacion: string
  presupuesto_min: number
  presupuesto_max: number
  created_at: string
  urgencia: "baja" | "media" | "alta"
  estado: "abierta" | "en-revision" | "cerrada"
  telefono: string
  email: string
  total_ofertas: number
}

const urgenciaConfig = {
  baja: { label: "Baja", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  media: { label: "Media", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  alta: { label: "Urgente", color: "bg-red-500/10 text-red-500 border-red-500/20" },
}

const CATEGORIAS = [
  "Todas las categorías",
  "Electricista",
  "Albañil",
  "Fontanero",
  "Instalador de suelos",
  "Pintor",
  "Carpintero",
  "Climatización",
  "Cerrajero",
  "Jardinero",
  "Arquitecto",
]

const UBICACIONES = ["Toda España", "Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao", "Zaragoza"]

const MOCK_DEMANDAS: Demanda[] = [
  {
    id: "demanda-mock-1",
    titulo: "Reforma completa de baño",
    descripcion:
      "Necesito una reforma completa del baño principal incluyendo cambio de azulejos, sanitarios, plato de ducha y mampara. El baño tiene aproximadamente 6m². Busco profesional con experiencia demostrable en este tipo de reformas.",
    categoria: { nombre: "Albañil" },
    cliente: { nombre: "María", apellido: "González", foto_perfil: "/professional-woman.png" },
    ubicacion: "Madrid, España",
    presupuesto_min: 3000,
    presupuesto_max: 5000,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    urgencia: "media",
    estado: "abierta",
    telefono: "+34 600 123 456",
    email: "maria.gonzalez@email.com",
    total_ofertas: 2,
  },
  {
    id: "demanda-mock-2",
    titulo: "Instalación de 3 splits de aire acondicionado",
    descripcion:
      "Necesito instalar 3 splits de aire acondicionado en mi vivienda: salón (35m²), dormitorio principal (20m²) y dormitorio secundario (15m²). Preferiblemente marca Mitsubishi o Daikin.",
    categoria: { nombre: "Climatización" },
    cliente: { nombre: "Carlos", apellido: "Martínez", foto_perfil: "/business-man.png" },
    ubicacion: "Barcelona, España",
    presupuesto_min: 2000,
    presupuesto_max: 3500,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    urgencia: "alta",
    estado: "abierta",
    telefono: "+34 611 234 567",
    email: "carlos.martinez@email.com",
    total_ofertas: 5,
  },
  {
    id: "demanda-mock-3",
    titulo: "Reparación urgente de fuga en cocina",
    descripcion:
      "Tengo una fuga de agua importante en la tubería de la cocina que necesita reparación urgente. El agua está saliendo por debajo del fregadero y está afectando al armario.",
    categoria: { nombre: "Fontanero" },
    cliente: { nombre: "Laura", apellido: "Sánchez", foto_perfil: "/woman-young.jpg" },
    ubicacion: "Valencia, España",
    presupuesto_min: 150,
    presupuesto_max: 400,
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    urgencia: "alta",
    estado: "abierta",
    telefono: "+34 622 345 678",
    email: "laura.sanchez@email.com",
    total_ofertas: 8,
  },
  {
    id: "demanda-mock-4",
    titulo: "Pintura interior vivienda 90m²",
    descripcion:
      "Pintar 90m² de vivienda incluyendo salón, 3 habitaciones, pasillo y techos. Las paredes están en buen estado, solo necesitan preparación básica y dos manos de pintura blanca mate.",
    categoria: { nombre: "Pintor" },
    cliente: { nombre: "Ana", apellido: "López", foto_perfil: "/woman-middle-age.jpg" },
    ubicacion: "Sevilla, España",
    presupuesto_min: 1500,
    presupuesto_max: 2500,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "baja",
    estado: "abierta",
    telefono: "+34 633 456 789",
    email: "ana.lopez@email.com",
    total_ofertas: 3,
  },
  {
    id: "demanda-mock-5",
    titulo: "Instalación suelo laminado 60m²",
    descripcion:
      "Quiero instalar suelo laminado en 60m² (salón y pasillo). Necesito incluir rodapié y desmontaje del suelo antiguo de terrazo. Tengo el material comprado.",
    categoria: { nombre: "Instalador de suelos" },
    cliente: { nombre: "Jorge", apellido: "Ruiz", foto_perfil: "/casual-man.png" },
    ubicacion: "Málaga, España",
    presupuesto_min: 800,
    presupuesto_max: 1200,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "media",
    estado: "abierta",
    telefono: "+34 644 567 890",
    email: "jorge.ruiz@email.com",
    total_ofertas: 1,
  },
  {
    id: "demanda-mock-6",
    titulo: "Instalación cuadro eléctrico nuevo",
    descripcion:
      "Necesito actualizar el cuadro eléctrico de mi vivienda antigua. Actualmente tiene fusibles y quiero cambiar a magnetotérmicos y diferencial. Boletín incluido.",
    categoria: { nombre: "Electricista" },
    cliente: { nombre: "Pedro", apellido: "Fernández", foto_perfil: "/man-elderly.jpg" },
    ubicacion: "Bilbao, España",
    presupuesto_min: 400,
    presupuesto_max: 700,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    urgencia: "baja",
    estado: "abierta",
    telefono: "+34 655 678 901",
    email: "pedro.fernandez@email.com",
    total_ofertas: 4,
  },
]

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `Hace ${diffMins} min`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays === 1) return "Ayer"
  if (diffDays < 7) return `Hace ${diffDays} días`
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
}

export default function DemandasServicios() {
  const [filtroCategoria, setFiltroCategoria] = useState<string>("Todas las categorías")
  const [filtroUbicacion, setFiltroUbicacion] = useState<string>("Toda España")
  const [filtroTiempo, setFiltroTiempo] = useState<string>("todos")
  const [rangoPresupuesto, setRangoPresupuesto] = useState<[number, number]>([0, 10000])
  const [busqueda, setBusqueda] = useState("")
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const [dialogAbierto, setDialogAbierto] = useState(false)
  const [demandaSeleccionada, setDemandaSeleccionada] = useState<Demanda | null>(null)
  const [dialogDetalles, setDialogDetalles] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loading, setLoading] = useState(true)

  const [formData, setFormData] = useState({
    precio: "",
    duracion: "",
    unidadTiempo: "dias",
    descripcion: "",
    materiales: "",
  })

  useEffect(() => {
    async function cargarDemandas() {
      setLoading(true)
      const result = await obtenerSolicitudesAbiertas()
      if (result.data && result.data.length > 0) {
        setDemandas(result.data)
      } else {
        setDemandas(MOCK_DEMANDAS)
      }
      setLoading(false)
    }
    cargarDemandas()
  }, [])

  const demandasFiltradas = demandas.filter((d) => {
    // Category filter
    if (filtroCategoria !== "Todas las categorías" && d.categoria?.nombre !== filtroCategoria) return false

    // Location filter
    if (filtroUbicacion !== "Toda España" && !d.ubicacion.toLowerCase().includes(filtroUbicacion.toLowerCase()))
      return false

    // Budget filter
    if (d.presupuesto_max < rangoPresupuesto[0] || d.presupuesto_min > rangoPresupuesto[1]) return false

    // Time filter
    if (filtroTiempo !== "todos") {
      const diffHours = (Date.now() - new Date(d.created_at).getTime()) / 3600000
      if (filtroTiempo === "hoy" && diffHours > 24) return false
      if (filtroTiempo === "semana" && diffHours > 168) return false
      if (filtroTiempo === "mes" && diffHours > 720) return false
    }

    // Search filter
    if (
      busqueda &&
      !d.titulo.toLowerCase().includes(busqueda.toLowerCase()) &&
      !d.descripcion.toLowerCase().includes(busqueda.toLowerCase())
    )
      return false

    return true
  })

  const handleVerDetalles = (demanda: Demanda) => {
    setDemandaSeleccionada(demanda)
    setDialogDetalles(true)
  }

  const handleEnviarOferta = (demanda: Demanda) => {
    setDemandaSeleccionada(demanda)
    setDialogAbierto(true)
  }

  const handleSubmitOferta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!demandaSeleccionada) return
    setIsSubmitting(true)

    try {
      const uploadPromises = attachedFiles.map((file) => uploadFile(file))
      const uploadResults = await Promise.all(uploadPromises)
      const successfulUploads = uploadResults.filter((result) => result !== null).map((result) => result!.url)

      const result = await crearOferta({
        solicitud_id: demandaSeleccionada.id,
        precio_propuesto: Number.parseFloat(formData.precio),
        tiempo_estimado: `${formData.duracion} ${formData.unidadTiempo}`,
        descripcion: formData.descripcion,
        incluye_materiales: formData.materiales === "si",
        archivos_adjuntos: successfulUploads,
      })

      if (result.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      } else {
        toast({ title: "Oferta enviada", description: "Tu presupuesto ha sido enviado correctamente." })
        setDialogAbierto(false)
        setFormData({ precio: "", duracion: "", unidadTiempo: "dias", descripcion: "", materiales: "" })
        setAttachedFiles([])
      }
    } catch (error) {
      toast({ title: "Error", description: "No se pudo enviar la oferta", variant: "destructive" })
    }

    setIsSubmitting(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles([...attachedFiles, ...Array.from(e.target.files)])
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar Filters - Desktop */}
      <aside className="hidden lg:block w-72 shrink-0">
        <Card className="sticky top-24 p-5 space-y-6 bg-card/50 backdrop-blur-sm border-border/50">
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </h3>
            <Separator />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Categoría profesional</Label>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Ubicación</Label>
            <Select value={filtroUbicacion} onValueChange={setFiltroUbicacion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UBICACIONES.map((ubi) => (
                  <SelectItem key={ubi} value={ubi}>
                    {ubi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Publicado</Label>
            <Select value={filtroTiempo} onValueChange={setFiltroTiempo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Cualquier momento</SelectItem>
                <SelectItem value="hoy">Últimas 24 horas</SelectItem>
                <SelectItem value="semana">Última semana</SelectItem>
                <SelectItem value="mes">Último mes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">
              Presupuesto: {rangoPresupuesto[0]}€ - {rangoPresupuesto[1]}€
            </Label>
            <Slider
              value={rangoPresupuesto}
              onValueChange={(value) => setRangoPresupuesto(value as [number, number])}
              max={10000}
              step={100}
              className="py-2"
            />
          </div>

          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={() => {
              setFiltroCategoria("Todas las categorías")
              setFiltroUbicacion("Toda España")
              setFiltroTiempo("todos")
              setRangoPresupuesto([0, 10000])
              setBusqueda("")
            }}
          >
            Limpiar filtros
          </Button>
        </Card>
      </aside>

      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {/* Search Bar */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar demandas..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 bg-background/50"
            />
          </div>
          <Button
            variant="outline"
            className="lg:hidden bg-transparent"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
          >
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filtros
          </Button>
        </div>

        {/* Mobile Filters */}
        {mostrarFiltros && (
          <Card className="lg:hidden p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroUbicacion} onValueChange={setFiltroUbicacion}>
                <SelectTrigger>
                  <SelectValue placeholder="Ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {UBICACIONES.map((ubi) => (
                    <SelectItem key={ubi} value={ubi}>
                      {ubi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        )}

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{demandasFiltradas.length}</span> demandas encontradas
          </p>
          <Select defaultValue="recientes">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recientes">Más recientes</SelectItem>
              <SelectItem value="presupuesto">Mayor presupuesto</SelectItem>
              <SelectItem value="ofertas">Menos ofertas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Demandas List */}
        {!loading && (
          <div className="space-y-4">
            {demandasFiltradas.map((demanda) => (
              <Card
                key={demanda.id}
                className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/20 bg-card/50 backdrop-blur-sm"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Main Content */}
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs font-normal">
                              {demanda.categoria?.nombre}
                            </Badge>
                            <Badge variant="outline" className={cn("text-xs", urgenciaConfig[demanda.urgencia].color)}>
                              {urgenciaConfig[demanda.urgencia].label}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                            {demanda.titulo}
                          </h3>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Presupuesto</p>
                          <p className="font-bold text-lg text-primary">
                            {demanda.presupuesto_min}€ - {demanda.presupuesto_max}€
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground line-clamp-2">{demanda.descripcion}</p>

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={demanda.cliente?.foto_perfil || "/placeholder.svg"} />
                            <AvatarFallback className="text-[10px]">
                              {demanda.cliente?.nombre?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {demanda.cliente?.nombre} {demanda.cliente?.apellido?.charAt(0)}.
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{demanda.ubicacion}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatTimeAgo(demanda.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          <span>{demanda.total_ofertas} ofertas</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex md:flex-col gap-2 md:w-32 shrink-0">
                      <Button className="flex-1 md:flex-none" onClick={() => handleEnviarOferta(demanda)}>
                        <Send className="h-4 w-4 mr-2" />
                        Ofertar
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 md:flex-none bg-transparent"
                        onClick={() => handleVerDetalles(demanda)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver más
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {demandasFiltradas.length === 0 && !loading && (
              <Card className="p-12 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No se encontraron demandas</h3>
                <p className="text-sm text-muted-foreground">Prueba a modificar los filtros o ampliar tu búsqueda</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Dialog Ver Detalles */}
      <Dialog open={dialogDetalles} onOpenChange={setDialogDetalles}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{demandaSeleccionada?.categoria?.nombre}</Badge>
              {demandaSeleccionada && (
                <Badge variant="outline" className={urgenciaConfig[demandaSeleccionada.urgencia].color}>
                  {urgenciaConfig[demandaSeleccionada.urgencia].label}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-xl">{demandaSeleccionada?.titulo}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={demandaSeleccionada?.cliente?.foto_perfil || "/placeholder.svg"} />
                <AvatarFallback>{demandaSeleccionada?.cliente?.nombre?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">
                  {demandaSeleccionada?.cliente?.nombre} {demandaSeleccionada?.cliente?.apellido}
                </p>
                <p className="text-sm text-muted-foreground">Cliente</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Presupuesto</p>
                <p className="font-bold text-primary">
                  {demandaSeleccionada?.presupuesto_min}€ - {demandaSeleccionada?.presupuesto_max}€
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Descripción del proyecto</h4>
              <p className="text-muted-foreground">{demandaSeleccionada?.descripcion}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{demandaSeleccionada?.ubicacion}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{demandaSeleccionada && formatTimeAgo(demandaSeleccionada.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{demandaSeleccionada?.total_ofertas} ofertas recibidas</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={() => {
                  setDialogDetalles(false)
                  if (demandaSeleccionada) handleEnviarOferta(demandaSeleccionada)
                }}
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar presupuesto
              </Button>
              <Button variant="outline" onClick={() => setDialogDetalles(false)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Contactar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Enviar Oferta */}
      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar presupuesto</DialogTitle>
            <DialogDescription>Para: {demandaSeleccionada?.titulo}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitOferta} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio propuesto (€)</Label>
                <Input
                  type="number"
                  value={formData.precio}
                  onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tiempo estimado</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={formData.duracion}
                    onChange={(e) => setFormData({ ...formData, duracion: e.target.value })}
                    placeholder="0"
                    className="w-20"
                    required
                  />
                  <Select
                    value={formData.unidadTiempo}
                    onValueChange={(v) => setFormData({ ...formData, unidadTiempo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horas">Horas</SelectItem>
                      <SelectItem value="dias">Días</SelectItem>
                      <SelectItem value="semanas">Semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Incluye materiales</Label>
              <Select value={formData.materiales} onValueChange={(v) => setFormData({ ...formData, materiales: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="si">Sí, incluido en el precio</SelectItem>
                  <SelectItem value="no">No, solo mano de obra</SelectItem>
                  <SelectItem value="parcial">Parcialmente incluidos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Descripción de tu propuesta</Label>
              <Textarea
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Describe tu experiencia, cómo abordarías el trabajo, disponibilidad..."
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Archivos adjuntos (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {file.name}
                    <button type="button" onClick={() => setAttachedFiles(attachedFiles.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <Paperclip className="h-4 w-4 mr-1" />
                  Adjuntar
                </Button>
                <input id="file-upload" type="file" multiple className="hidden" onChange={handleFileChange} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => setDialogAbierto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar presupuesto
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
