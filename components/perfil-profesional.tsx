"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

import { useState, useEffect, useCallback } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn, formatearPrecioEuros, formatearRangoPortfolio } from "@/lib/utils"
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
  Loader2,
  Globe,
  Upload,
  LogOut,
  Trash2,
  Bell,
  BadgeCheck,
  FileUp,
  ClipboardCheck,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { actualizarPerfil, obtenerPerfilActual } from "@/app/actions/profiles"
import { SelectorCategorias, SelectorProvincias } from "@/components/selector-cobertura"
import { SelectCategoriaJerarquico } from "@/components/select-categoria-jerarquico"
import { PROVINCIAS_ES } from "@/lib/provincias"
import {
  actualizarItemPortfolio,
  crearItemPortfolio,
  obtenerPortfolioPorProfesional,
  obtenerTrabajosCompletadosParaPortfolio,
  eliminarItemPortfolio,
} from "@/app/actions/portfolio"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { uploadFile } from "@/lib/upload-helpers"
import { createClient } from "@/lib/supabase/client"
import { desvincularPushActual } from "@/lib/push/client"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { RangoPrecio } from "@/components/rango-precio"
import { PRECIO_MAX } from "@/lib/precios"
import { SolicitudVerificacionProfesional } from "@/components/solicitud-verificacion-profesional"

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

function formatearPresupuestoInteres([minimo, maximo]: [number, number], t: ReturnType<typeof useT>, idioma: "es" | "en") {
  if (minimo <= 0 && maximo >= PRECIO_MAX) return t("Cualquier presupuesto")
  if (maximo >= PRECIO_MAX) return t("Desde {precio}", { precio: formatearPrecioEuros(minimo, idioma) })
  if (minimo === maximo) return formatearPrecioEuros(minimo, idioma)
  if (minimo <= 0) return t("Hasta {precio}", { precio: formatearPrecioEuros(maximo, idioma) })
  return `${formatearPrecioEuros(minimo, idioma)} – ${formatearPrecioEuros(maximo, idioma)}`
}

export default function PerfilProfesional({ editable = false }: PerfilProfesionalProps) {
  const t = useT()
  const { idioma } = useIdioma()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const completarProfesional = searchParams.get("completar") === "profesional"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [tienePerfilProfesional, setTienePerfilProfesional] = useState(false)
  const mostrarEditorProfesional = tienePerfilProfesional || completarProfesional

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
    // De servicio y provincia depende que llegue un aviso; el rango añade un
    // filtro opcional de presupuesto y empieza abierto para no ocultar nada.
    categorias_interes: [] as string[],
    provincias_cobertura: [] as string[],
    presupuesto_interes: [0, PRECIO_MAX] as [number, number],
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
  const [snapshotEdicion, setSnapshotEdicion] = useState<typeof editData | null>(null)
  const actualizarVerificacion = useCallback((verificado: boolean) => {
    setEditData((actual) => actual.verificado === verificado ? actual : {
      ...actual,
      verificado,
      nivel: verificado ? "Profesional Verificado" : "Profesional",
    })
  }, [])

  const [newSkill, setNewSkill] = useState("")
  const [newCert, setNewCert] = useState("")
  const [newLanguage, setNewLanguage] = useState("")

  // Portfolio: el alta/baja vive aquí porque /mi-perfil es el único editor de perfil.
  const [profesionalId, setProfesionalId] = useState<string | null>(null)
  const [showPortfolioDialog, setShowPortfolioDialog] = useState(false)
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null)
  const [savingPortfolio, setSavingPortfolio] = useState(false)
  const [uploadingPortfolioImg, setUploadingPortfolioImg] = useState(false)
  const [deletingPortfolioId, setDeletingPortfolioId] = useState<string | null>(null)
  const [trabajosDiime, setTrabajosDiime] = useState<any[]>([])
  const [loadingTrabajosDiime, setLoadingTrabajosDiime] = useState(false)
  const [showTrabajosDiime, setShowTrabajosDiime] = useState(false)
  const PORTFOLIO_VACIO = {
    titulo: "",
    descripcion: "",
    imagen_url: "",
    categoria: "",
    fecha_completado: "",
    ubicacion: "",
    duracion: "",
    presupuesto: "",
    trabajo_id: "",
    contexto_proveedor: "",
  }
  const [newPortfolioItem, setNewPortfolioItem] = useState(PORTFOLIO_VACIO)

  useEffect(() => {
    async function cargarPerfil() {
      setLoading(true)
      const result = await obtenerPerfilActual()
      if (result.data) {
        const { data } = result
        setTienePerfilProfesional(Boolean(data.profesional))
        setProfesionalId(data.id)
        const datosPerfil = {
          nombre: data.nombre || "",
          apellido: data.apellido || "",
          titulo: data.profesional?.titulo || "",
          ubicacion: data.ubicacion || "",
          // La descripción vive en `profiles`, que es donde la escribe
          // actualizarPerfil. Leerla de `profesionales` hacía que el formulario
          // volviera vacío aunque el guardado hubiera ido bien (y por eso la
          // ficha pública sí la mostraba: esa lee de profiles).
          // Se conserva el valor antiguo como respaldo por si alguna ficha
          // quedó con la descripción en la tabla de profesionales.
          bio: data.bio || data.profesional?.bio || "",
          foto_perfil: data.foto_perfil || "",
          foto_portada: data.foto_portada || "",
          telefono: data.telefono || "",
          email: data.email || "",
          rating: data.profesional?.rating_promedio || 0,
          total_reviews: data.profesional?.total_reseñas || 0,
          proyectos_completados: data.profesional?.proyectos_completados || 0,
          anos_experiencia: data.profesional?.["años_experiencia"] ?? data.profesional?.anos_experiencia ?? 0,
          tarifa_hora: data.profesional?.tarifa_por_hora || 0,
          tiempo_respuesta: data.profesional?.tiempo_respuesta || "24 horas",
          nivel: data.verificado ? "Profesional Verificado" : "Profesional",
          disponibilidad: data.profesional?.disponible ? "Disponible" : "No disponible",
          verificado: data.verificado || false,
          habilidades: data.profesional?.habilidades || [],
          categorias_interes: data.profesional?.categorias_interes || [],
          provincias_cobertura: data.profesional?.provincias_cobertura || [],
          presupuesto_interes: [
            data.profesional?.presupuesto_min_interes == null
              ? 0
              : Number(data.profesional.presupuesto_min_interes),
            data.profesional?.presupuesto_max_interes == null
              ? PRECIO_MAX
              : Number(data.profesional.presupuesto_max_interes),
          ] as [number, number],
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
        }
        setEditData(datosPerfil)
        setSnapshotEdicion(completarProfesional ? datosPerfil : null)
        setIsEditing(completarProfesional)
        if (data.profesional) await cargarPortfolio(data.id)
      } else if (("codigo" in result && result.codigo === "NO_AUTENTICADO") || result.error === t("No autenticado")) {
        router.push("/auth/login")
        return
      }
      setLoading(false)
    }
    cargarPerfil()
  }, [completarProfesional])

  // La tabla guarda `imagen_url`; las tarjetas de abajo leen `imagen`.
  const cargarPortfolio = async (id: string) => {
    const { data } = await obtenerPortfolioPorProfesional(id)
    if (!data) return
    setEditData((prev) => ({
      ...prev,
      portfolio: data.map((item: any) => ({
        ...item,
        imagen: item.imagen_url || (Array.isArray(item.imagenes) ? item.imagenes[0] : ""),
      })),
    }))
  }

  const handlePortfolioImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPortfolioImg(true)
    const result = await uploadFile(file)
    setUploadingPortfolioImg(false)

    if (result) {
      setNewPortfolioItem((prev) => ({ ...prev, imagen_url: result.url }))
    } else {
      toast({ title: t("Error"), description: t("No se pudo subir la imagen."), variant: "destructive" })
    }
  }

  const handleAddPortfolio = async () => {
    if (!newPortfolioItem.titulo || !newPortfolioItem.descripcion) {
      toast({
        title: t("Campos requeridos"),
        description: t("Completa título y descripción."),
        variant: "destructive",
      })
      return
    }

    setSavingPortfolio(true)
    const result = editingPortfolioId
      ? await actualizarItemPortfolio(editingPortfolioId, newPortfolioItem)
      : await crearItemPortfolio(newPortfolioItem)
    setSavingPortfolio(false)

    if (result.error) {
      toast({ title: t("Error"), description: result.error ? t(result.error) : undefined, variant: "destructive" })
      return
    }

    toast({
      title: editingPortfolioId ? t("Proyecto actualizado") : t("Proyecto añadido"),
      description: t("Ya aparece en tu portfolio."),
    })
    setShowPortfolioDialog(false)
    setNewPortfolioItem(PORTFOLIO_VACIO)
    setEditingPortfolioId(null)
    if (profesionalId) await cargarPortfolio(profesionalId)
  }

  const handleEditPortfolio = (item: any) => {
    setEditingPortfolioId(item.id)
    setNewPortfolioItem({
      titulo: item.titulo || "",
      descripcion: item.descripcion || "",
      imagen_url: item.imagen || "",
      categoria: item.categoria || "",
      fecha_completado: item.fecha_proyecto || "",
      ubicacion: item.ubicacion || "",
      duracion: item.duracion || "",
      presupuesto: item.presupuesto != null ? String(item.presupuesto) : "",
      trabajo_id: item.trabajo_id || "",
      contexto_proveedor: item.contexto_proveedor || "",
    })
    setShowPortfolioDialog(true)
  }

  const cargarTrabajosDiime = async () => {
    setShowTrabajosDiime(true)
    if (trabajosDiime.length > 0) return
    setLoadingTrabajosDiime(true)
    const result = await obtenerTrabajosCompletadosParaPortfolio()
    setLoadingTrabajosDiime(false)
    if (result.error) {
      toast({ title: t("No se pudieron cargar tus trabajos"), description: result.error ? t(result.error) : undefined, variant: "destructive" })
      return
    }
    setTrabajosDiime(result.data || [])
  }

  const seleccionarTrabajoDiime = (trabajo: any) => {
    const archivos = Array.isArray(trabajo.oferta?.archivos) ? trabajo.oferta.archivos : []
    const solicitud = trabajo.solicitud || {}
    setNewPortfolioItem({
      ...newPortfolioItem,
      titulo: solicitud.titulo || "",
      descripcion: solicitud.descripcion || "",
      imagen_url: archivos[0] || "",
      categoria: solicitud.categoria?.nombre || "",
      fecha_completado: trabajo.fecha_fin || "",
      ubicacion: solicitud.ubicacion || trabajo.ubicacion || "",
      presupuesto: trabajo.precio_acordado != null ? String(trabajo.precio_acordado) : "",
      trabajo_id: trabajo.id,
      contexto_proveedor: "",
    })
    setShowTrabajosDiime(false)
  }

  const handleDeletePortfolio = async (itemId: string) => {
    setDeletingPortfolioId(itemId)
    const result = await eliminarItemPortfolio(itemId)
    setDeletingPortfolioId(null)

    if (result.error) {
      toast({ title: t("Error"), description: result.error ? t(result.error) : undefined, variant: "destructive" })
      return
    }

    toast({ title: t("Proyecto eliminado"), description: t("Se ha quitado de tu portfolio.") })
    if (profesionalId) await cargarPortfolio(profesionalId)
  }

  const handleSave = async () => {
    // Sin categorías ni provincias no se puede avisar de ninguna demanda, así
    // que no se deja guardar el perfil a medias.
    if (mostrarEditorProfesional && editData.categorias_interes.length === 0) {
      toast({
        title: t("Elige tus servicios"),
        description: t("Marca al menos una categoría para que te lleguen las demandas que te interesan."),
        variant: "destructive",
      })
      return
    }
    if (mostrarEditorProfesional && editData.provincias_cobertura.length === 0) {
      toast({
        title: t("Elige tu zona"),
        description: t("Marca al menos una provincia en la que quieras cubrir demandas."),
        variant: "destructive",
      })
      return
    }

    setSaving(true)

    const result = await actualizarPerfil({
      nombre: editData.nombre,
      apellido: editData.apellido,
      bio: editData.bio,
      ubicacion: editData.ubicacion,
      telefono: editData.telefono,
      foto_perfil: editData.foto_perfil,
      foto_portada: editData.foto_portada,
      ...(mostrarEditorProfesional ? {
        titulo: editData.titulo,
        habilidades: editData.habilidades,
        categorias_interes: editData.categorias_interes,
        provincias_cobertura: editData.provincias_cobertura,
        presupuesto_min_interes: editData.presupuesto_interes[0] <= 0 ? null : editData.presupuesto_interes[0],
        presupuesto_max_interes:
          editData.presupuesto_interes[1] >= PRECIO_MAX ? null : editData.presupuesto_interes[1],
        certificaciones: editData.certificaciones,
        idiomas: editData.idiomas,
        tarifa_por_hora: editData.tarifa_hora,
        anos_experiencia: editData.anos_experiencia,
      } : {}),
    })

    setSaving(false)

    if (result.error) {
      toast({
        title: t("Error"),
        description: t("No se pudo actualizar el perfil: {error}", { error: t(result.error) }),
        variant: "destructive",
      })
    } else {
      toast({
        title: t("Perfil actualizado"),
        description: t("Tu información ha sido guardada correctamente."),
      })
      setSnapshotEdicion(null)
      setIsEditing(false)
      if (mostrarEditorProfesional) setTienePerfilProfesional(true)
      if (completarProfesional) router.replace("/mi-perfil")
      router.refresh()
    }
  }

  const iniciarEdicion = () => {
    setSnapshotEdicion(editData)
    setIsEditing(true)
  }

  const cancelarEdicion = () => {
    if (snapshotEdicion) setEditData(snapshotEdicion)
    setSnapshotEdicion(null)
    setIsEditing(false)
    if (completarProfesional) router.replace("/mi-perfil")
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

  const handleLogout = async () => {
    setLoggingOut(true)
    await desvincularPushActual()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
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
        title: t("Foto actualizada"),
        description: t("Tu foto de perfil se ha subido correctamente."),
      })
    } else {
      toast({
        title: t("Error"),
        description: t("No se pudo subir la imagen. Inténtalo de nuevo."),
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
        title: t("Portada actualizada"),
        description: t("Tu imagen de portada se ha subido correctamente."),
      })
    } else {
      toast({
        title: t("Error"),
        description: t("No se pudo subir la imagen. Inténtalo de nuevo."),
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

  // La ficha profesional puede coexistir con el uso como cliente. Su existencia,
  // y no el tipo de cuenta elegido al registrarse, decide qué editor mostrar.
  if (!mostrarEditorProfesional) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-24 md:pb-0">
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={editData.foto_perfil || undefined} alt={t("Tu foto de perfil")} />
                <AvatarFallback className="text-2xl">{editData.nombre.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-2">
                <h1 className="break-words text-2xl font-bold">{editData.nombre} {editData.apellido}</h1>
                <Badge variant="secondary">{t("Cliente")}</Badge>
              </div>
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <Button onClick={handleSave} disabled={saving || isUploading}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t("Guardar cambios")}
                    </Button>
                    <Button variant="outline" onClick={cancelarEdicion} disabled={saving}>{t("Cancelar")}</Button>
                  </>
                ) : (
                  <Button onClick={iniciarEdicion}><Edit2 className="mr-2 h-4 w-4" />{t("Editar perfil")}</Button>
                )}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            {isEditing ? (
              <div className="space-y-2">
                <Label htmlFor="cliente-avatar-upload">{t("Foto de perfil")}</Label>
                <Input id="cliente-avatar-upload" type="file" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                {isUploading ? <p className="text-sm text-muted-foreground">{t("Subiendo foto...")}</p> : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["nombre", t("Nombre"), "text"],
                ["apellido", t("Apellidos"), "text"],
                ["telefono", t("Teléfono"), "tel"],
              ] as const).map(([campo, etiqueta, tipo]) => (
                <div key={campo} className="space-y-2">
                  <Label htmlFor={`cliente-${campo}`}>{etiqueta}</Label>
                  {isEditing ? (
                    <Input id={`cliente-${campo}`} type={tipo} value={editData[campo]}
                      onChange={(e) => setEditData({ ...editData, [campo]: e.target.value })} />
                  ) : <p>{editData[campo] || t("No especificado")}</p>}
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="cliente-provincia">{t("Provincia")}</Label>
                {isEditing ? (
                  <Select value={editData.ubicacion} onValueChange={(ubicacion) => setEditData({ ...editData, ubicacion })}>
                    <SelectTrigger id="cliente-provincia"><SelectValue placeholder={t("Elige tu provincia")} /></SelectTrigger>
                    <SelectContent>
                      {provincias.map((prov) => <SelectItem key={prov.codigo} value={prov.provincia}>{prov.provincia}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <p>{editData.ubicacion || t("No especificada")}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium">{t("Correo electrónico")}</p>
                <p className="break-all">{editData.email || t("No especificado")}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-bio">{t("Sobre mí")}</Label>
              {isEditing ? (
                <Textarea id="cliente-bio" rows={4} value={editData.bio} placeholder={t("Cuéntanos algo sobre ti.")}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })} />
              ) : <p className="text-muted-foreground">{editData.bio || t("No has añadido una descripción todavía.")}</p>}
            </div>
          </CardContent>
        </Card>
        {editable ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("También puedes ofrecer servicios")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t("Completa tu perfil de proveedor para enviar ofertas. Podrás seguir contratando servicios con esta misma cuenta.")}</p>
              <Button asChild><Link href="/convertirse-profesional">{t("Crear perfil de proveedor")}</Link></Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  }

  // Sin servicios o sin provincias no llega ningún aviso de demanda nueva.
  const sinCobertura = editData.categorias_interes.length === 0 || editData.provincias_cobertura.length === 0

  return (
    <div className="space-y-6">
      {/* Cover & Profile Header */}
      <div className="relative">
        <div className="h-48 md:h-64 rounded-xl overflow-hidden bg-gradient-to-r from-primary/20 to-primary/5">
          <img
            src={editData.foto_portada || "/placeholder.svg"}
            alt={t("Cover")}
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
                {isUploading ? t("Subiendo...") : t("Cambiar portada")}
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
                          placeholder={t("Nombre")}
                          className="text-xl font-bold h-auto py-1 w-32"
                        />
                        <Input
                          value={editData.apellido}
                          onChange={(e) => setEditData({ ...editData, apellido: e.target.value })}
                          placeholder={t("Apellidos")}
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
                        placeholder={t("Título profesional (ej: Maestro Albañil)")}
                        className="text-muted-foreground"
                      />
                    ) : (
                      <p className="text-lg text-muted-foreground">{editData.titulo || t("Sin título profesional")}</p>
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
                              <SelectValue placeholder={t("Provincia")} />
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
                          <span>{editData.ubicacion || t("Sin ubicación")}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{editData.proyectos_completados} {t("proyectos")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{t("Responde en")} {t(editData.tiempo_respuesta)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                        <span className="font-bold text-lg">{editData.rating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({editData.total_reviews} {t("valoraciones)")}</span>
                      </div>
                      <Badge variant="secondary">{t(editData.nivel)}</Badge>
                      <Badge
                        variant={editData.disponibilidad === "Disponible" ? "default" : "secondary"}
                        className={editData.disponibilidad === "Disponible" ? "bg-emerald-500" : ""}
                      >
                        {t(editData.disponibilidad)}
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
                            {t("Guardar cambios")}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={cancelarEdicion}
                          >
                            {t("Cancelar")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={iniciarEdicion}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            {t("Editar perfil")}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 bg-transparent"
                          >
                            {loggingOut ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <LogOut className="h-4 w-4 mr-2" />
                            )}
                            {t("Cerrar sesion")}
                          </Button>
                        </>
                      )
                    ) : (
                      <>
                        <Button>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          {t("Enviar mensaje")}
                        </Button>
                        <Button variant="outline">
                          <Phone className="h-4 w-4 mr-2" />
                          {t("Contactar")}
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

      {editable && tienePerfilProfesional ? (
        <div className="px-4 md:px-0">
          <SolicitudVerificacionProfesional
            key={profesionalId}
            onVerificacionActualizada={actualizarVerificacion}
          />
        </div>
      ) : null}

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
                {t("Sobre mí")}
              </TabsTrigger>
              <TabsTrigger
                value="portfolio"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                {t("Portfolio")}
              </TabsTrigger>
              <TabsTrigger
                value="valoraciones"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                {t("Valoraciones")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sobre-mi" className="space-y-6 pt-6">
              {/* Bio */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("Descripción")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <Textarea
                      value={editData.bio}
                      onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                      rows={5}
                      placeholder={t("Describe tu experiencia, especialización y qué te hace único...")}
                    />
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">
                      {editData.bio || t("No has añadido una descripción todavía.")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Professional Info */}
              {isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t("Información Profesional")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="tarifa">{t("Tarifa por hora (€)")}</Label>
                        <Input
                          id="tarifa"
                          type="number"
                          value={editData.tarifa_hora}
                          onChange={(e) => setEditData({ ...editData, tarifa_hora: Number(e.target.value) })}
                          placeholder="35"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="experiencia">{t("Años de experiencia")}</Label>
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
                  <CardTitle className="text-lg">{t("Contacto")}</CardTitle>
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
                      <span>{editData.telefono || t("No especificado")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <span>{editData.email || t("No especificado")}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Servicio, zona y presupuesto: filtros de los avisos de demandas */}
              <Card className={sinCobertura ? "border-amber-500/50" : undefined}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    {t("Avisos de nuevas demandas")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t("Elige qué servicios, provincias y presupuestos te interesan. Solo te avisaremos de las demandas que encajen con estos filtros.")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {sinCobertura && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {t("No estás recibiendo avisos de demandas")}
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        {t("Elige tus servicios y tus provincias")} {!isEditing && <>{t("(pulsa «Editar perfil»)")} </>}{t("para empezar a recibirlas.")}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t("Servicios que ofreces")}
                      {isEditing && <span className="text-destructive ml-1">*</span>}
                    </p>
                    {!isEditing && editData.categorias_interes.length === 0 ? (
                      <p className="text-muted-foreground text-sm">{t("Todavía no has elegido servicios.")}</p>
                    ) : (
                      <SelectorCategorias
                        seleccionadas={editData.categorias_interes}
                        onChange={(v) => setEditData({ ...editData, categorias_interes: v })}
                        disabled={!isEditing}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t("Provincias que cubres")}
                      {isEditing && <span className="text-destructive ml-1">*</span>}
                    </p>
                    {!isEditing && editData.provincias_cobertura.length === 0 ? (
                      <p className="text-muted-foreground text-sm">{t("Todavía no has elegido provincias.")}</p>
                    ) : (
                      <SelectorProvincias
                        seleccionadas={editData.provincias_cobertura}
                        onChange={(v) => setEditData({ ...editData, provincias_cobertura: v })}
                        disabled={!isEditing}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t("Presupuesto total del proyecto")}</p>
                      {isEditing &&
                        (editData.presupuesto_interes[0] > 0 || editData.presupuesto_interes[1] < PRECIO_MAX) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto px-2 py-1 text-xs"
                            onClick={() =>
                              setEditData({ ...editData, presupuesto_interes: [0, PRECIO_MAX] })
                            }
                          >
                            {t("Cualquier presupuesto")}
                          </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("Las demandas con presupuesto «A convenir» también se incluyen.")}
                    </p>
                    {isEditing ? (
                      <RangoPrecio
                        value={editData.presupuesto_interes}
                        onChange={(v) => setEditData({ ...editData, presupuesto_interes: v })}
                        progresivo
                        etiqueta="Presupuesto de la demanda"
                      />
                    ) : (
                      <p className="text-sm rounded-md border bg-muted/30 px-3 py-2">
                        {formatearPresupuestoInteres(editData.presupuesto_interes, t, idioma)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Skills */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("Habilidades")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {editData.habilidades.length === 0 && !isEditing && (
                      <p className="text-muted-foreground text-sm">{t("No has añadido habilidades todavía.")}</p>
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
                        placeholder={t("Nueva habilidad...")}
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
                    {t("Certificaciones")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t("Declaradas por el proveedor")}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editData.certificaciones.length === 0 && !isEditing && (
                    <p className="text-muted-foreground text-sm">{t("No has añadido certificaciones todavía.")}</p>
                  )}
                  <div className="space-y-2">
                    {editData.certificaciones.map((cert, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
                        <span className="min-w-0 break-words">{cert}</span>
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => removeCertification(i)}
                            aria-label={t("Eliminar certificación {certificacion}", { certificacion: cert })}
                            className="shrink-0 hover:text-destructive"
                          >
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
                        placeholder={t("Nueva certificación...")}
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
                    {t("Idiomas")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editData.idiomas.length === 0 && !isEditing && (
                    <p className="text-muted-foreground text-sm">{t("No has añadido idiomas todavía.")}</p>
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
                        placeholder={t("Nuevo idioma (ej: Español - Nativo)...")}
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
              {editable && (
                <div className="flex justify-end mb-4">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      setEditingPortfolioId(null)
                      setNewPortfolioItem(PORTFOLIO_VACIO)
                      setShowTrabajosDiime(false)
                      setShowPortfolioDialog(true)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {t("Añadir proyecto")}
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editData.portfolio.length === 0 && (
                  <div className="col-span-2 text-center py-12 text-muted-foreground">
                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{t("No tienes proyectos en tu portfolio todavía.")}</p>
                    {editable && (
                      <p className="text-sm mt-2">
                        {t("Usa «Añadir proyecto» para mostrar tus trabajos a los clientes.")}
                      </p>
                    )}
                  </div>
                )}
                {editData.portfolio.map((item: any) => (
                  <Card key={item.id} className="group overflow-hidden hover:shadow-lg transition-all">
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={item.imagen || "/placeholder.svg"}
                        alt={item.titulo}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {editable && (
                        <div className="absolute top-2 right-2 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            aria-label={t("Editar {titulo}", { titulo: item.titulo })}
                            onClick={() => handleEditPortfolio(item)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            aria-label={t("Eliminar {titulo}", { titulo: item.titulo })}
                            disabled={deletingPortfolioId === item.id}
                            onClick={() => handleDeletePortfolio(item.id)}
                          >
                            {deletingPortfolioId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h4 className="font-semibold">{item.titulo}</h4>
                      {item.trabajo_id && (
                        <Badge className="mt-2 gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="h-3.5 w-3.5" /> {t("Verificado por Diime")}
                        </Badge>
                      )}
                      <p className="text-sm text-muted-foreground">{item.descripcion}</p>
                      {item.contexto_proveedor && (
                        <div className="mt-3 border-t pt-3">
                          <p className="text-xs font-medium text-foreground">{t("Aporte del profesional")}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{item.contexto_proveedor}</p>
                        </div>
                      )}
                      {(item.ubicacion || item.duracion) && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {[item.ubicacion, item.duracion].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {formatearRangoPortfolio(item.presupuesto, idioma) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("Coste publicado aproximado:")} {formatearRangoPortfolio(item.presupuesto, idioma)}
                        </p>
                      )}
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
                      <p className="text-sm text-muted-foreground">{editData.total_reviews} {t("valoraciones")}</p>
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
                  <p>{t("Aún no tienes valoraciones.")}</p>
                  <p className="text-sm mt-2">{t("Las valoraciones aparecerán aquí cuando completes proyectos.")}</p>
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
              <CardTitle className="text-lg">{t("Estadísticas")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Proyectos completados")}</span>
                <span className="font-bold">{editData.proyectos_completados}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Años de experiencia")}</span>
                <span className="font-bold">{editData.anos_experiencia}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Tarifa por hora")}</span>
                      <span className="font-bold">{formatearPrecioEuros(editData.tarifa_hora, idioma)}/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Tiempo de respuesta")}</span>
                <span className="font-bold">{t(editData.tiempo_respuesta)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showPortfolioDialog} onOpenChange={setShowPortfolioDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPortfolioId ? t("Editar proyecto del portfolio") : t("Añadir proyecto al portfolio")}</DialogTitle>
            <DialogDescription>
              {t("Muestra un trabajo que ya hayas realizado. Aparecerá en tu perfil público.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!editingPortfolioId && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t("¿Ya hiciste este trabajo en Diime?")}</p>
                    <p className="text-xs text-muted-foreground">{t("Importa sus datos y añádelo como trabajo verificado.")}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={cargarTrabajosDiime}>
                    <ClipboardCheck className="h-4 w-4" /> {t("Seleccionar trabajo")}
                  </Button>
                </div>
                {showTrabajosDiime && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {loadingTrabajosDiime ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("Cargando trabajos…")}</div>
                    ) : trabajosDiime.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("Aún no tienes trabajos finalizados en Diime.")}</p>
                    ) : (
                      trabajosDiime.map((trabajo) => (
                        <button
                          key={trabajo.id}
                          type="button"
                          onClick={() => seleccionarTrabajoDiime(trabajo)}
                          className="w-full rounded-md border p-2.5 text-left transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium"><BadgeCheck className="h-4 w-4 text-emerald-600" /> {trabajo.solicitud?.titulo}</span>
                          {(trabajo.solicitud?.ubicacion || trabajo.ubicacion) && <span className="block mt-0.5 text-xs text-muted-foreground">{trabajo.solicitud?.ubicacion || trabajo.ubicacion}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {newPortfolioItem.trabajo_id && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <BadgeCheck className="h-4 w-4 shrink-0" /> {t("Trabajo verificado por Diime")}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="pf-titulo">{newPortfolioItem.trabajo_id ? t("Título de la demanda") : t("Título del proyecto *")}</Label>
              <Input
                id="pf-titulo"
                value={newPortfolioItem.titulo}
                onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, titulo: e.target.value })}
                placeholder={t("Ej: Reforma integral de cocina")}
                disabled={Boolean(newPortfolioItem.trabajo_id)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-descripcion">{newPortfolioItem.trabajo_id ? t("Descripción de la demanda") : t("Descripción *")}</Label>
              <Textarea
                id="pf-descripcion"
                rows={3}
                value={newPortfolioItem.descripcion}
                onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, descripcion: e.target.value })}
                placeholder={t("Describe el proyecto, los retos y el resultado...")}
                disabled={Boolean(newPortfolioItem.trabajo_id)}
              />
              {newPortfolioItem.trabajo_id && (
                <p className="text-xs text-muted-foreground">{t("Este texto lo publicó el cliente y se muestra tal cual en el portfolio.")}</p>
              )}
            </div>

            {newPortfolioItem.trabajo_id && (
              <div className="space-y-1.5">
                <Label htmlFor="pf-contexto">{t("Tu aporte al trabajo")}</Label>
                <Textarea
                  id="pf-contexto"
                  rows={3}
                  value={newPortfolioItem.contexto_proveedor}
                  onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, contexto_proveedor: e.target.value })}
                  placeholder={t("Explica cómo lo realizaste, materiales empleados, retos resueltos o el resultado conseguido...")}
                />
                <p className="text-xs text-muted-foreground">{t("Se mostrará separado de la descripción original de la demanda.")}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pf-imagen">{t("Adjuntar archivos")}</Label>
              {newPortfolioItem.imagen_url ? (
                <div className="relative h-40 rounded-md overflow-hidden border">
                  <img
                    src={newPortfolioItem.imagen_url}
                    alt={t("Vista previa del proyecto")}
                    className="w-full h-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2 h-7 w-7"
                    aria-label={t("Quitar archivo")}
                    onClick={() => {
                      setNewPortfolioItem({ ...newPortfolioItem, imagen_url: "" })
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Input
                    id="pf-imagen"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingPortfolioImg}
                    onChange={handlePortfolioImageUpload}
                  />
                  <Label
                    htmlFor="pf-imagen"
                    className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 text-center transition-colors hover:bg-muted"
                  >
                    {uploadingPortfolioImg ? <Loader2 className="mb-2 h-5 w-5 animate-spin" /> : <FileUp className="mb-2 h-5 w-5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{uploadingPortfolioImg ? t("Subiendo archivo…") : t("Adjuntar archivos")}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{t("Añade una imagen para enseñar el resultado (opcional).")}</span>
                  </Label>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("Servicio")}</Label>
                <SelectCategoriaJerarquico
                  value={newPortfolioItem.categoria}
                  onChange={(categoria) => setNewPortfolioItem({ ...newPortfolioItem, categoria })}
                  placeholder={t("Selecciona un servicio")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-fecha">{t("Fecha de finalización")}</Label>
                <Input
                  id="pf-fecha"
                  type="date"
                  value={newPortfolioItem.fecha_completado}
                  onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, fecha_completado: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-ubicacion">{t("Ubicación")}</Label>
                <Select
                  value={newPortfolioItem.ubicacion}
                  onValueChange={(ubicacion) => setNewPortfolioItem({ ...newPortfolioItem, ubicacion })}
                >
                  <SelectTrigger id="pf-ubicacion"><SelectValue placeholder={t("Selecciona una provincia")} /></SelectTrigger>
                  <SelectContent>
                    {PROVINCIAS_ES.map((provincia) => <SelectItem key={provincia} value={provincia}>{provincia}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-duracion">{t("Duración")}</Label>
                <Input
                  id="pf-duracion"
                  value={newPortfolioItem.duracion}
                  onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, duracion: e.target.value })}
                  placeholder={t("2 semanas")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-presupuesto">{t("Presupuesto (€)")}</Label>
              <Input
                id="pf-presupuesto"
                type="number"
                min={0}
                step="any"
                value={newPortfolioItem.presupuesto}
                onChange={(e) => setNewPortfolioItem({ ...newPortfolioItem, presupuesto: e.target.value })}
                placeholder="5000"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => {
                setShowPortfolioDialog(false)
                setEditingPortfolioId(null)
              }}
              disabled={savingPortfolio}
            >
              {t("Cancelar")}
            </Button>
            <Button onClick={handleAddPortfolio} disabled={savingPortfolio || uploadingPortfolioImg}>
              {savingPortfolio ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("Guardando...")}
                </>
              ) : (
                editingPortfolioId ? t("Guardar proyecto") : t("Añadir proyecto")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
