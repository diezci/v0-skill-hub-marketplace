"use client"

import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  Loader2,
  Globe,
  Upload,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { actualizarPerfil, obtenerPerfilActual } from "@/app/actions/profiles"
import { uploadFile } from "@/lib/upload-helpers"

const provincias = [
  { provincia: "Álava", codigo: "01" },
  { provincia: "Albacete", codigo: "02" },
  { provincia: "Alicante", codigo: "03" },
  { provincia: "Almería", codigo: "04" },
  { provincia: "Ávila", codigo: "05" },
  { provincia: "Badajoz", codigo: "06" },
  { provincia: "Islas Baleares", codigo: "07" },
  { provincia: "Barcelona", codigo: "08" },
  { provincia: "Burgos", codigo: "09" },
  { provincia: "Cáceres", codigo: "10" },
  { provincia: "Cádiz", codigo: "11" },
  { provincia: "Castellón", codigo: "12" },
  { provincia: "Ciudad Real", codigo: "13" },
  { provincia: "Córdoba", codigo: "14" },
  { provincia: "Cuenca", codigo: "16" },
  { provincia: "Girona", codigo: "17" },
  { provincia: "Granada", codigo: "18" },
  { provincia: "Guadalajara", codigo: "19" },
  { provincia: "Guipúzcoa", codigo: "20" },
  { provincia: "Huelva", codigo: "21" },
  { provincia: "Huesca", codigo: "22" },
  { provincia: "Jaén", codigo: "23" },
  { provincia: "La Coruña", codigo: "15" },
  { provincia: "La Rioja", codigo: "26" },
  { provincia: "Las Palmas", codigo: "35" },
  { provincia: "León", codigo: "24" },
  { provincia: "Lleida", codigo: "25" },
  { provincia: "Lugo", codigo: "27" },
  { provincia: "Madrid", codigo: "28" },
  { provincia: "Málaga", codigo: "29" },
  { provincia: "Murcia", codigo: "30" },
  { provincia: "Navarra", codigo: "31" },
  { provincia: "Ourense", codigo: "32" },
  { provincia: "Asturias", codigo: "33" },
  { provincia: "Palencia", codigo: "34" },
  { provincia: "Pontevedra", codigo: "36" },
  { provincia: "Segovia", codigo: "40" },
  { provincia: "Sevilla", codigo: "41" },
  { provincia: "Soria", codigo: "42" },
  { provincia: "Tarragona", codigo: "43" },
  { provincia: "Teruel", codigo: "44" },
  { provincia: "Toledo", codigo: "45" },
  { provincia: "Valencia", codigo: "46" },
  { provincia: "Valladolid", codigo: "47" },
  { provincia: "Vizcaya", codigo: "48" },
  { provincia: "Zamora", codigo: "49" },
  { provincia: "Zaragoza", codigo: "50" },
  { provincia: "Ceuta", codigo: "51" },
  { provincia: "Melilla", codigo: "52" },
]

interface PerfilProfesionalProps {
  editable?: boolean
}

export default function PerfilProfesional({ editable = false }: PerfilProfesionalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [editData, setEditData] = useState({
    nombre: "",
    apellido: "",
    titulo: "",
    ubicacion: "",
    bio: "",
    foto_perfil: "",
    foto_portada: "",
    telefono: "",
    email: "",
    rating: 0,
    total_reviews: 0,
    proyectos_completados: 0,
    anos_experiencia: 0,
    tarifa_hora: 0,
    tiempo_respuesta: "24 horas",
    nivel: "Profesional",
    disponibilidad: "Disponible",
    verificado: false,
    habilidades: [] as string[],
    certificaciones: [] as string[],
    idiomas: [] as string[],
    portfolio: [] as any[],
    reviews: [] as any[],
    estadisticas: {
      entrega_tiempo: 0,
      calidad_trabajo: 0,
      comunicacion: 0,
      precio_calidad: 0,
    },
  })

  const [newSkill, setNewSkill] = useState("")
  const [newCert, setNewCert] = useState("")
  const [newLanguage, setNewLanguage] = useState("")

  useEffect(() => {
    async function cargarPerfil() {
      const result = await obtenerPerfilActual()
      if (result.data) {
        const { data } = result
        setEditData({
          nombre: data.nombre || "",
          apellido: data.apellido || "",
          titulo: data.profesional?.titulo || "",
          ubicacion: data.ubicacion || "",
          bio: data.profesional?.bio || "",
          foto_perfil: data.foto_perfil || "",
          foto_portada: data.foto_portada || "",
          telefono: data.telefono || "",
          email: data.email || "",
          rating: data.profesional?.rating_promedio || 0,
          total_reviews: data.profesional?.total_reseñas || 0,
          proyectos_completados: data.profesional?.proyectos_completados || 0,
          anos_experiencia: data.profesional?.anos_experiencia || 0,
          tarifa_hora: data.profesional?.tarifa_por_hora || 0,
          tiempo_respuesta: data.profesional?.tiempo_respuesta || "24 horas",
          nivel: data.profesional?.verificado ? "Profesional Verificado" : "Profesional",
          disponibilidad: data.profesional?.disponible ? "Disponible" : "No disponible",
          verificado: data.profesional?.verificado || false,
          habilidades: data.profesional?.habilidades || [],
          certificaciones: data.profesional?.certificaciones || [],
          idiomas: data.profesional?.idiomas || [],
          portfolio: [],
          reviews: [],
          estadisticas: {
            entrega_tiempo: 0,
            calidad_trabajo: 0,
            comunicacion: 0,
            precio_calidad: 0,
          },
        })
      }
      setLoading(false)
    }
    cargarPerfil()
  }, [])

  const handleSave = async () => {
    setSaving(true)

    const result = await actualizarPerfil({
      nombre: editData.nombre,
      apellido: editData.apellido,
      titulo: editData.titulo,
      bio: editData.bio,
      ubicacion: editData.ubicacion,
      telefono: editData.telefono,
      foto_perfil: editData.foto_perfil,
      foto_portada: editData.foto_portada,
      habilidades: editData.habilidades,
      certificaciones: editData.certificaciones,
      idiomas: editData.idiomas,
      tarifa_por_hora: editData.tarifa_hora,
      anos_experiencia: editData.anos_experiencia,
    })

    setSaving(false)

    if (result.error) {
      toast({
        title: "Error",
        description: `No se pudo actualizar el perfil: ${result.error}`,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Perfil actualizado",
        description: "Tu información ha sido guardada correctamente.",
      })
      setIsEditing(false)
    }
  }

  const addSkill = () => {
    if (newSkill.trim() && !editData.habilidades.includes(newSkill.trim())) {
      setEditData({ ...editData, habilidades: [...editData.habilidades, newSkill.trim()] })
      setNewSkill("")
    }
  }

  const removeSkill = (index: number) => {
    setEditData({ ...editData, habilidades: editData.habilidades.filter((_, i) => i !== index) })
  }

  const addCertification = () => {
    if (newCert.trim() && !editData.certificaciones.includes(newCert.trim())) {
      setEditData({ ...editData, certificaciones: [...editData.certificaciones, newCert.trim()] })
      setNewCert("")
    }
  }

  const removeCertification = (index: number) => {
    setEditData({ ...editData, certificaciones: editData.certificaciones.filter((_, i) => i !== index) })
  }

  const addLanguage = () => {
    if (newLanguage.trim() && !editData.idiomas.includes(newLanguage.trim())) {
      setEditData({ ...editData, idiomas: [...editData.idiomas, newLanguage.trim()] })
      setNewLanguage("")
    }
  }

  const removeLanguage = (index: number) => {
    setEditData({ ...editData, idiomas: editData.idiomas.filter((_, i) => i !== index) })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const result = await uploadFile(file)
    setIsUploading(false)

    if (result) {
      setEditData({ ...editData, foto_perfil: result.url })
      toast({
        title: "Foto actualizada",
        description: "Tu foto de perfil se ha subido correctamente.",
      })
    } else {
      toast({
        title: "Error",
        description: "No se pudo subir la imagen. Inténtalo de nuevo.",
        variant: "destructive",
      })
    }
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const result = await uploadFile(file)
    setIsUploading(false)

    if (result) {
      setEditData({ ...editData, foto_portada: result.url })
      toast({
        title: "Portada actualizada",
        description: "Tu imagen de portada se ha subido correctamente.",
      })
    } else {
      toast({
        title: "Error",
        description: "No se pudo subir la imagen. Inténtalo de nuevo.",
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cover & Profile Header */}
      <div className="relative">
        <div className="h-48 md:h-64 rounded-xl overflow-hidden bg-gradient-to-r from-primary/20 to-primary/5">
          <img
            src={editData.foto_portada || "/placeholder.svg"}
            alt="Cover"
            className="w-full h-full object-cover"
          />
          {editable && isEditing && (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-4 right-4"
                onClick={() => document.getElementById("cover-upload")?.click()}
                disabled={isUploading}
              >
                <Camera className="h-4 w-4 mr-2" />
                {isUploading ? "Subiendo..." : "Cambiar portada"}
              </Button>
              <input
                id="cover-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverUpload}
              />
            </>
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
                  <>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-0 right-0"
                      onClick={() => document.getElementById("avatar-upload")?.click()}
                      disabled={isUploading}
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                  </>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <Input
                          value={editData.nombre}
                          onChange={(e) => setEditData({ ...editData, nombre: e.target.value })}
                          placeholder="Nombre"
                          className="text-xl font-bold h-auto py-1 w-32"
                        />
                        <Input
                          value={editData.apellido}
                          onChange={(e) => setEditData({ ...editData, apellido: e.target.value })}
                          placeholder="Apellidos"
                          className="text-xl font-bold h-auto py-1 flex-1"
                        />
                      </div>
                    ) : (
                      <h1 className="text-2xl md:text-3xl font-bold">
                        {editData.nombre} {editData.apellido}
                      </h1>
                    )}

                    {isEditing ? (
                      <Input
                        value={editData.titulo}
                        onChange={(e) => setEditData({ ...editData, titulo: e.target.value })}
                        placeholder="Título profesional (ej: Maestro Albañil)"
                        className="text-muted-foreground"
                      />
                    ) : (
                      <p className="text-lg text-muted-foreground">{editData.titulo || "Sin título profesional"}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {isEditing ? (
                          <Select
                            value={editData.ubicacion}
                            onValueChange={(value) => setEditData({ ...editData, ubicacion: value })}
                          >
                            <SelectTrigger className="h-7 w-40">
                              <SelectValue placeholder="Provincia" />
                            </SelectTrigger>
                            <SelectContent>
                              {provincias.map((prov) => (
                                <SelectItem key={prov.codigo} value={prov.provincia}>
                                  {prov.provincia}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span>{editData.ubicacion || "Sin ubicación"}</span>
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
                        <span className="font-bold text-lg">{editData.rating.toFixed(1)}</span>
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
                            onClick={() => setIsEditing(false)}
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
                      placeholder="Describe tu experiencia, especialización y qué te hace único..."
                    />
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">
                      {editData.bio || "No has añadido una descripción todavía."}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Professional Info */}
              {isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Información Profesional</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tarifa">Tarifa por hora (€)</Label>
                        <Input
                          id="tarifa"
                          type="number"
                          value={editData.tarifa_hora}
                          onChange={(e) => setEditData({ ...editData, tarifa_hora: Number(e.target.value) })}
                          placeholder="35"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="experiencia">Años de experiencia</Label>
                        <Input
                          id="experiencia"
                          type="number"
                          value={editData.anos_experiencia}
                          onChange={(e) => setEditData({ ...editData, anos_experiencia: Number(e.target.value) })}
                          placeholder="10"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contact Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contacto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    {isEditing ? (
                      <Input
                        type="tel"
                        value={editData.telefono}
                        onChange={(e) => setEditData({ ...editData, telefono: e.target.value })}
                        placeholder="+34 612 345 678"
                        className="flex-1"
                      />
                    ) : (
                      <span>{editData.telefono || "No especificado"}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <span>{editData.email || "No especificado"}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Skills */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Habilidades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {editData.habilidades.length === 0 && !isEditing && (
                      <p className="text-muted-foreground text-sm">No has añadido habilidades todavía.</p>
                    )}
                    {editData.habilidades.map((skill, i) => (
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
                        onKeyPress={(e) => e.key === "Enter" && addSkill()}
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
                <CardContent className="space-y-3">
                  {editData.certificaciones.length === 0 && !isEditing && (
                    <p className="text-muted-foreground text-sm">No has añadido certificaciones todavía.</p>
                  )}
                  <div className="space-y-2">
                    {editData.certificaciones.map((cert, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-emerald-500" />
                          <span>{cert}</span>
                        </div>
                        {isEditing && (
                          <button onClick={() => removeCertification(i)} className="hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isEditing && (
                    <div className="flex gap-2">
                      <Input
                        value={newCert}
                        onChange={(e) => setNewCert(e.target.value)}
                        placeholder="Nueva certificación..."
                        className="flex-1"
                        onKeyPress={(e) => e.key === "Enter" && addCertification()}
                      />
                      <Button onClick={addCertification} size="icon" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Languages */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Idiomas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editData.idiomas.length === 0 && !isEditing && (
                    <p className="text-muted-foreground text-sm">No has añadido idiomas todavía.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {editData.idiomas.map((lang, i) => (
                      <Badge key={i} variant="outline" className="text-sm py-1.5 px-3">
                        <CheckCircle className="h-3 w-3 mr-1.5 text-emerald-500" />
                        {lang}
                        {isEditing && (
                          <button onClick={() => removeLanguage(i)} className="ml-2 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                  </div>
                  {isEditing && (
                    <div className="flex gap-2">
                      <Input
                        value={newLanguage}
                        onChange={(e) => setNewLanguage(e.target.value)}
                        placeholder="Nuevo idioma (ej: Español - Nativo)..."
                        className="flex-1"
                        onKeyPress={(e) => e.key === "Enter" && addLanguage()}
                      />
                      <Button onClick={addLanguage} size="icon" variant="outline">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="portfolio" className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editData.portfolio.length === 0 && (
                  <div className="col-span-2 text-center py-12 text-muted-foreground">
                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No tienes proyectos en tu portfolio todavía.</p>
                    {editable && (
                      <p className="text-sm mt-2">Añade proyectos desde la sección de Portfolio en Mi Cuenta.</p>
                    )}
                  </div>
                )}
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
              </div>
            </TabsContent>

            <TabsContent value="valoraciones" className="space-y-6 pt-6">
              {/* Rating Summary */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="text-center">
                      <div className="text-5xl font-bold mb-2">{editData.rating.toFixed(1)}</div>
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
                            <span className="font-medium">{value}%</span>
                          </div>
                          <Progress value={value} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Reviews */}
              {editData.reviews.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Star className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aún no tienes valoraciones.</p>
                  <p className="text-sm mt-2">Las valoraciones aparecerán aquí cuando completes proyectos.</p>
                </div>
              )}
              <div className="space-y-4">
                {editData.reviews.map((review: any) => (
                  <Card key={review.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <Avatar>
                          <AvatarImage src={review.avatar || "/placeholder.svg"} />
                          <AvatarFallback>{review.cliente?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold">{review.cliente}</h4>
                            <span className="text-sm text-muted-foreground">{review.fecha}</span>
                          </div>
                          <div className="flex items-center gap-1 my-1">
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
                          <p className="text-sm text-muted-foreground mt-2">{review.texto}</p>
                          {review.proyecto && (
                            <Badge variant="secondary" className="mt-2">
                              {review.proyecto}
                            </Badge>
                          )}
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
          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Estadísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Proyectos completados</span>
                <span className="font-bold">{editData.proyectos_completados}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Años de experiencia</span>
                <span className="font-bold">{editData.anos_experiencia}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tarifa por hora</span>
                <span className="font-bold">{editData.tarifa_hora}€/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tiempo de respuesta</span>
                <span className="font-bold">{editData.tiempo_respuesta}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
