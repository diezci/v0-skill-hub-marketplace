"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Star,
  MapPin,
  Briefcase,
  Clock,
  Phone,
  Mail,
  MessageCircle,
  CheckCircle,
  Award,
  Camera,
  Plus,
  X,
  Edit2,
  ExternalLink,
  ThumbsUp,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PerfilProfesionalProps {
  editable?: boolean
  perfil?: any
  onSave?: (data: any) => void
  saving?: boolean
}

// Mock data for demonstration
const MOCK_PERFIL = {
  id: "1",
  nombre: "Carlos",
  apellido: "Rodríguez García",
  titulo: "Maestro Albañil Especializado en Reformas Integrales",
  ubicacion: "Madrid, España",
  bio: "Con más de 15 años de experiencia en el sector de la construcción y reformas, me especializo en reformas integrales de viviendas, rehabilitación de edificios y obras nuevas. Mi compromiso es ofrecer un trabajo de calidad, cumpliendo plazos y presupuestos acordados. Cuento con un equipo de profesionales cualificados para proyectos de cualquier envergadura.",
  foto_perfil: "/professional-man-construction.jpg",
  foto_portada: "/construction-renovation-work.jpg",
  telefono: "+34 612 345 678",
  email: "carlos.rodriguez@email.com",
  rating: 4.9,
  total_reviews: 127,
  proyectos_completados: 89,
  anos_experiencia: 15,
  tarifa_hora: 35,
  tiempo_respuesta: "2 horas",
  nivel: "Experto Verificado",
  disponibilidad: "Disponible",
  verificado: true,
  habilidades: [
    "Albañilería",
    "Reformas integrales",
    "Azulejos",
    "Tabiquería",
    "Impermeabilización",
    "Solados",
    "Alicatados",
  ],
  certificaciones: ["Técnico en Construcción", "PRL 60h", "Trabajos en Altura", "Carné de Carretillero"],
  idiomas: ["Español (Nativo)", "Inglés (Básico)"],
  portfolio: [
    {
      id: 1,
      titulo: "Reforma baño completo",
      imagen: "/modern-bathroom-renovation.png",
      descripcion: "Reforma integral de baño de 8m² con cambio de distribución",
    },
    {
      id: 2,
      titulo: "Cocina abierta",
      imagen: "/kitchen-renovation-open-concept.jpg",
      descripcion: "Apertura de cocina al salón y reforma completa",
    },
    {
      id: 3,
      titulo: "Rehabilitación fachada",
      imagen: "/building-facade-renovation.png",
      descripcion: "Rehabilitación de fachada en edificio del centro",
    },
    {
      id: 4,
      titulo: "Reforma integral piso",
      imagen: "/apartment-full-renovation.jpg",
      descripcion: "Reforma completa de vivienda de 90m²",
    },
  ],
  reviews: [
    {
      id: 1,
      cliente: "María G.",
      avatar: "/serene-woman.png",
      rating: 5,
      fecha: "Hace 2 semanas",
      texto:
        "Excelente trabajo en la reforma de mi baño. Carlos y su equipo fueron muy profesionales, puntuales y el resultado superó mis expectativas. Lo recomiendo 100%.",
      proyecto: "Reforma de baño",
    },
    {
      id: 2,
      cliente: "Antonio L.",
      avatar: "/man-face-elderly.jpg",
      rating: 5,
      fecha: "Hace 1 mes",
      texto:
        "Gran profesional. Realizó la reforma de mi cocina en el tiempo acordado y con una calidad impecable. Muy limpio y ordenado durante toda la obra.",
      proyecto: "Reforma de cocina",
    },
    {
      id: 3,
      cliente: "Laura S.",
      avatar: "/woman-young-face.jpg",
      rating: 4,
      fecha: "Hace 2 meses",
      texto:
        "Buen trabajo en general. Hubo un pequeño retraso pero el resultado final fue muy bueno. Buena comunicación durante todo el proceso.",
      proyecto: "Alicatado terraza",
    },
  ],
  estadisticas: {
    entrega_tiempo: 95,
    calidad_trabajo: 98,
    comunicacion: 96,
    precio_calidad: 94,
  },
}

export default function PerfilProfesional({
  editable = false,
  perfil = MOCK_PERFIL,
  onSave,
  saving = false,
}: PerfilProfesionalProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(perfil)
  const [newSkill, setNewSkill] = useState("")
  const [newCert, setNewCert] = useState("")

  const handleSave = () => {
    if (onSave) {
      onSave(editData)
    }
    setIsEditing(false)
  }

  const addSkill = () => {
    if (newSkill.trim()) {
      setEditData({ ...editData, habilidades: [...editData.habilidades, newSkill.trim()] })
      setNewSkill("")
    }
  }

  const removeSkill = (index: number) => {
    setEditData({ ...editData, habilidades: editData.habilidades.filter((_: any, i: number) => i !== index) })
  }

  return (
    <div className="space-y-6">
      {/* Cover & Profile Header */}
      <div className="relative">
        <div className="h-48 md:h-64 rounded-xl overflow-hidden bg-gradient-to-r from-primary/20 to-primary/5">
          <img src={editData.foto_portada || "/placeholder.svg"} alt="Cover" className="w-full h-full object-cover" />
          {editable && isEditing && (
            <Button size="sm" variant="secondary" className="absolute top-4 right-4">
              <Camera className="h-4 w-4 mr-2" />
              Cambiar portada
            </Button>
          )}
        </div>

        <Card className="relative mx-4 md:mx-8 -mt-16 md:-mt-20 border-border/50 bg-card/95 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar className="h-28 w-28 md:h-36 md:w-36 border-4 border-background shadow-xl">
                  <AvatarImage src={editData.foto_perfil || "/placeholder.svg"} />
                  <AvatarFallback className="text-3xl">{editData.nombre?.charAt(0)}</AvatarFallback>
                </Avatar>
                {editData.verificado && (
                  <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                )}
                {editable && isEditing && (
                  <Button size="icon" variant="secondary" className="absolute bottom-0 right-0">
                    <Camera className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2">
                    {isEditing ? (
                      <Input
                        value={`${editData.nombre} ${editData.apellido}`}
                        onChange={(e) => {
                          const parts = e.target.value.split(" ")
                          setEditData({ ...editData, nombre: parts[0], apellido: parts.slice(1).join(" ") })
                        }}
                        className="text-2xl font-bold h-auto py-1"
                      />
                    ) : (
                      <h1 className="text-2xl md:text-3xl font-bold">
                        {editData.nombre} {editData.apellido}
                      </h1>
                    )}

                    {isEditing ? (
                      <Input
                        value={editData.titulo}
                        onChange={(e) => setEditData({ ...editData, titulo: e.target.value })}
                        className="text-muted-foreground"
                      />
                    ) : (
                      <p className="text-lg text-muted-foreground">{editData.titulo}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {isEditing ? (
                          <Input
                            value={editData.ubicacion}
                            onChange={(e) => setEditData({ ...editData, ubicacion: e.target.value })}
                            className="h-6 w-32"
                          />
                        ) : (
                          <span>{editData.ubicacion}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{editData.proyectos_completados} proyectos</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>Responde en {editData.tiempo_respuesta}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                        <span className="font-bold text-lg">{editData.rating}</span>
                        <span className="text-muted-foreground">({editData.total_reviews} valoraciones)</span>
                      </div>
                      <Badge variant="secondary">{editData.nivel}</Badge>
                      <Badge
                        variant={editData.disponibilidad === "Disponible" ? "default" : "secondary"}
                        className={editData.disponibilidad === "Disponible" ? "bg-emerald-500" : ""}
                      >
                        {editData.disponibilidad}
                      </Badge>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {editable ? (
                      isEditing ? (
                        <>
                          <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Guardar cambios
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditing(false)
                              setEditData(perfil)
                            }}
                          >
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => setIsEditing(true)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Editar perfil
                        </Button>
                      )
                    ) : (
                      <>
                        <Button>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Enviar mensaje
                        </Button>
                        <Button variant="outline">
                          <Phone className="h-4 w-4 mr-2" />
                          Contactar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-4 md:px-0">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="sobre-mi" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="sobre-mi"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Sobre mí
              </TabsTrigger>
              <TabsTrigger
                value="portfolio"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Portfolio
              </TabsTrigger>
              <TabsTrigger
                value="valoraciones"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Valoraciones
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sobre-mi" className="space-y-6 pt-6">
              {/* Bio */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Descripción</CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <Textarea
                      value={editData.bio}
                      onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                      rows={5}
                    />
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">{editData.bio}</p>
                  )}
                </CardContent>
              </Card>

              {/* Skills */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Habilidades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {editData.habilidades.map((skill: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-sm py-1.5 px-3">
                        {skill}
                        {isEditing && (
                          <button onClick={() => removeSkill(i)} className="ml-2 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                  {isEditing && (
                    <div className="flex gap-2">
                      <Input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        placeholder="Nueva habilidad..."
                        className="flex-1"
                      />
                      <Button onClick={addSkill} size="icon" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Certifications */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Certificaciones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {editData.certificaciones.map((cert: string, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                        <span>{cert}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="portfolio" className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editData.portfolio.map((item: any) => (
                  <Card key={item.id} className="group overflow-hidden cursor-pointer hover:shadow-lg transition-all">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={item.imagen || "/placeholder.svg"}
                        alt={item.titulo}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <Button size="sm" variant="secondary">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver proyecto
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <h4 className="font-semibold">{item.titulo}</h4>
                      <p className="text-sm text-muted-foreground">{item.descripcion}</p>
                    </CardContent>
                  </Card>
                ))}
                {isEditing && (
                  <Card className="flex items-center justify-center h-48 border-dashed cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="text-center">
                      <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Añadir proyecto</p>
                    </div>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="valoraciones" className="space-y-6 pt-6">
              {/* Rating Summary */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="text-center">
                      <div className="text-5xl font-bold mb-2">{editData.rating}</div>
                      <div className="flex justify-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={cn(
                              "h-5 w-5",
                              star <= Math.round(editData.rating) ? "fill-amber-500 text-amber-500" : "text-muted",
                            )}
                          />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">{editData.total_reviews} valoraciones</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      {Object.entries(editData.estadisticas).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize">{key.replace("_", " ")}</span>
                            <span className="font-medium">{value as number}%</span>
                          </div>
                          <Progress value={value as number} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reviews */}
              <div className="space-y-4">
                {editData.reviews.map((review: any) => (
                  <Card key={review.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <Avatar>
                          <AvatarImage src={review.avatar || "/placeholder.svg"} />
                          <AvatarFallback>{review.cliente.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-medium">{review.cliente}</p>
                              <p className="text-xs text-muted-foreground">
                                {review.proyecto} · {review.fecha}
                              </p>
                            </div>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={cn(
                                    "h-4 w-4",
                                    star <= review.rating ? "fill-amber-500 text-amber-500" : "text-muted",
                                  )}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-muted-foreground">{review.texto}</p>
                          <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground">
                            <ThumbsUp className="h-4 w-4 mr-1" />
                            Útil
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tarifa por hora</span>
                <span className="font-bold text-lg text-primary">{editData.tarifa_hora}€/h</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Experiencia</span>
                <span className="font-medium">{editData.anos_experiencia} años</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Proyectos</span>
                <span className="font-medium">{editData.proyectos_completados} completados</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Respuesta</span>
                <span className="font-medium">{editData.tiempo_respuesta}</span>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{editData.telefono}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{editData.email}</span>
              </div>
            </CardContent>
          </Card>

          {/* Languages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Idiomas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {editData.idiomas.map((idioma: string, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">{idioma}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
