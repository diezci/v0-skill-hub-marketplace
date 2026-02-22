"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Camera, Plus, X, Upload, Loader2, MapPin } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { uploadFile } from "@/lib/upload-helpers"
import { actualizarPerfil, obtenerPerfilActual } from "@/app/actions/profiles"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

export default function EditarPerfil() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [profileData, setProfileData] = useState({
    name: "",
    title: "",
    location: "",
    bio: "",
    phone: "",
    email: "",
    hourlyRate: 0,
    yearsExperience: 0,
    responseTime: "",
    avatar: "",
    coverImage: "",
  })

  const [skills, setSkills] = useState<string[]>([])
  const [certifications, setCertifications] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])

  const [newSkill, setNewSkill] = useState("")
  const [newCertification, setNewCertification] = useState("")
  const [newLanguage, setNewLanguage] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    async function cargarPerfil() {
      const result = await obtenerPerfilActual()
      if (result.data) {
        const { data } = result
        setProfileData({
          name: `${data.nombre || ""} ${data.apellido || ""}`,
          title: data.profesional?.titulo || "",
          location: data.ubicacion || "",
          bio: data.profesional?.bio || "",
          phone: data.telefono || "",
          email: data.email || "",
          hourlyRate: data.profesional?.tarifa_por_hora || 0,
          yearsExperience: data.profesional?.anos_experiencia || 0,
          responseTime: data.profesional?.tiempo_respuesta || "24 horas",
          avatar: data.foto_perfil || "",
          coverImage: data.foto_portada || "",
        })
        setSkills(data.profesional?.habilidades || [])
        setCertifications(data.profesional?.certificaciones || [])
        setLanguages(data.profesional?.idiomas || [])
      }
      setLoading(false)
    }
    cargarPerfil()
  }, [])

  const handleInputChange = (field: string, value: string | number) => {
    setProfileData({ ...profileData, [field]: value })
  }

  const addSkill = () => {
    if (newSkill.trim()) {
      setSkills([...skills, newSkill.trim()])
      setNewSkill("")
    }
  }

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index))
  }

  const addCertification = () => {
    if (newCertification.trim()) {
      setCertifications([...certifications, newCertification.trim()])
      setNewCertification("")
    }
  }

  const removeCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index))
  }

  const addLanguage = () => {
    if (newLanguage.trim()) {
      setLanguages([...languages, newLanguage.trim()])
      setNewLanguage("")
    }
  }

  const removeLanguage = (index: number) => {
    setLanguages(languages.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    const nameParts = profileData.name.split(" ")

    console.log("[v0] Saving profile data:", profileData)

    const result = await actualizarPerfil({
      nombre: nameParts[0],
      apellido: nameParts.slice(1).join(" "),
      titulo: profileData.title,
      bio: profileData.bio,
      ubicacion: profileData.location,
      telefono: profileData.phone,
      foto_perfil: profileData.avatar,
      foto_portada: profileData.coverImage,
      habilidades: skills,
      certificaciones: certifications,
      idiomas: languages,
      tarifa_por_hora: profileData.hourlyRate,
      anos_experiencia: profileData.yearsExperience,
      tiempo_respuesta: profileData.responseTime,
    })

    setSaving(false)

    console.log("[v0] Profile save result:", result)

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
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const result = await uploadFile(file)
    setIsUploading(false)

    if (result) {
      setProfileData({ ...profileData, avatar: result.url })
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
      setProfileData({ ...profileData, coverImage: result.url })
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
      <Card>
        <CardHeader>
          <CardTitle>Fotos de Perfil</CardTitle>
          <CardDescription>Actualiza tu foto de perfil y imagen de portada</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label>Imagen de Portada</Label>
            <div className="relative mt-2 h-48 rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors">
              <img
                src={profileData.coverImage || "/placeholder.svg"}
                alt="Cover"
                className="w-full h-full object-cover"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-4 right-4"
                onClick={() => document.getElementById("cover-upload")?.click()}
                disabled={isUploading}
              >
                <Camera className="h-4 w-4 mr-2" />
                {isUploading ? "Subiendo..." : "Cambiar Portada"}
              </Button>
              <input id="cover-upload" type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            </div>
          </div>

          <div>
            <Label>Foto de Perfil</Label>
            <div className="flex items-center gap-4 mt-2">
              <Avatar className="h-24 w-24">
                <AvatarImage src={profileData.avatar || "/placeholder.svg"} />
                <AvatarFallback>{profileData.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <Button
                variant="outline"
                onClick={() => document.getElementById("avatar-upload")?.click()}
                disabled={isUploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Subiendo..." : "Cambiar Foto"}
              </Button>
              <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Información Básica</CardTitle>
          <CardDescription>Actualiza tu información personal y profesional</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo</Label>
              <Input id="name" value={profileData.name} onChange={(e) => handleInputChange("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Provincia
              </Label>
              <Select value={profileData.location} onValueChange={(value) => handleInputChange("location", value)}>
                <SelectTrigger id="location">
                  <SelectValue placeholder="Selecciona una provincia" />
                </SelectTrigger>
                <SelectContent>
                  {provincias.map((prov) => (
                    <SelectItem key={prov.codigo} value={`${prov.provincia}`}>
                      {prov.provincia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título Profesional</Label>
            <Input
              id="title"
              value={profileData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="ej: Maestro Albañil Especializado en Reformas"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Biografía</Label>
            <Textarea
              id="bio"
              value={profileData.bio}
              onChange={(e) => handleInputChange("bio", e.target.value)}
              rows={4}
              placeholder="Describe tu experiencia y especialización..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                type="tel"
                value={profileData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profileData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                disabled
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Tarifa por Hora (€)</Label>
              <Input
                id="hourlyRate"
                type="number"
                value={profileData.hourlyRate}
                onChange={(e) => handleInputChange("hourlyRate", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearsExperience">Años de Experiencia</Label>
              <Input
                id="yearsExperience"
                type="number"
                value={profileData.yearsExperience}
                onChange={(e) => handleInputChange("yearsExperience", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responseTime">Tiempo de Respuesta</Label>
              <Input
                id="responseTime"
                value={profileData.responseTime}
                onChange={(e) => handleInputChange("responseTime", e.target.value)}
                placeholder="ej: 2 horas"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Habilidades</CardTitle>
          <CardDescription>Añade tus habilidades y competencias profesionales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {skill}
                <button onClick={() => removeSkill(index)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              placeholder="Nueva habilidad..."
              onKeyPress={(e) => e.key === "Enter" && addSkill()}
            />
            <Button onClick={addSkill} variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificaciones</CardTitle>
          <CardDescription>Añade tus certificaciones y títulos profesionales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {certifications.map((cert, index) => (
              <Badge key={index} variant="outline" className="gap-1">
                {cert}
                <button onClick={() => removeCertification(index)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newCertification}
              onChange={(e) => setNewCertification(e.target.value)}
              placeholder="Nueva certificación..."
              onKeyPress={(e) => e.key === "Enter" && addCertification()}
            />
            <Button onClick={addCertification} variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Idiomas</CardTitle>
          <CardDescription>Añade los idiomas que hablas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {languages.map((lang, index) => (
              <Badge key={index} variant="default" className="gap-1">
                {lang}
                <button onClick={() => removeLanguage(index)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value)}
              placeholder="Nuevo idioma..."
              onKeyPress={(e) => e.key === "Enter" && addLanguage()}
            />
            <Button onClick={addLanguage} variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline">Cancelar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar Cambios
        </Button>
      </div>
    </div>
  )
}
