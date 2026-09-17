import { getT } from "@/lib/i18n-servidor"
import Link from "next/link"
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  IdCard,
  Mail,
  MapPin,
  Phone,
  Star,
  UserRound,
  Wrench,
} from "lucide-react"
import { obtenerUsuarioConTrabajosAdmin } from "@/app/actions/admin-trabajos"
import { AdminChatUsuarioButton } from "@/components/admin-chat-usuario-button"
import { AdminUsuarioTrabajos } from "@/components/admin-usuario-trabajos"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatearFecha, formatearMoneda } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function AdminUsuarioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { t, idioma } = await getT()

  const { id } = await params
  const resultado = await obtenerUsuarioConTrabajosAdmin(id)

  if (!resultado.data) {
    return (
      <div className="p-6 space-y-6">
        <Button asChild variant="ghost" className="gap-2">
          <Link href="/admin/usuarios">
            <ArrowLeft className="h-4 w-4" /> {" "}{t("Volver a usuarios")}</Link>
        </Button>
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>{resultado.error || t("No se pudo cargar el usuario.")}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { usuario, trabajos, adminId } = resultado.data
  const recibidos = trabajos.filter((trabajo) => trabajo.cliente_id === usuario.id)
  const prestados = trabajos.filter((trabajo) => trabajo.profesional_id === usuario.id)
  const completados = trabajos.filter((trabajo) => trabajo.estado === "completado")
  const volumen = trabajos
    .filter((trabajo) => trabajo.contratado)
    .reduce((total, trabajo) => total + trabajo.precio_acordado, 0)
  const nombre = `${usuario.nombre ?? ""} ${usuario.apellido ?? ""}`.trim() || t("Usuario")
  const iniciales = `${usuario.nombre?.[0] ?? ""}${usuario.apellido?.[0] ?? ""}`.toUpperCase() || "U"

  return (
    <div className="p-6 space-y-6">
      <Button asChild variant="ghost" className="gap-2">
        <Link href="/admin/usuarios">
          <ArrowLeft className="h-4 w-4" /> {" "}{t("Volver a usuarios")}</Link>
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={usuario.foto_perfil || ""} />
              <AvatarFallback className="bg-primary/10 text-lg text-primary">{iniciales}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{nombre}</h1>
                {usuario.es_admin ? (
                  <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/30">{t("Admin")}</Badge>
                ) : usuario.profesional ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    {t("Profesional")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("Cliente")}</Badge>
                )}
                {usuario.profesional && usuario.verificado && (
                  <Badge className="gap-1 bg-blue-500/10 text-blue-700 border-blue-500/30">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {" "}{t("Verificado")}</Badge>
                )}
              </div>
              {usuario.profesional?.titulo && (
                <p className="mt-1 text-muted-foreground">{usuario.profesional.titulo}</p>
              )}
              {usuario.profesional?.rating_promedio != null && (
                <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {usuario.profesional.rating_promedio.toFixed(1)} · {usuario.profesional.total_reseñas ?? 0} {" "}{t("reseñas")}</p>
              )}
              {usuario.id !== adminId && (
                <AdminChatUsuarioButton usuarioId={usuario.id} nombre={nombre} className="mt-4" />
              )}
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[430px]">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" /> {usuario.email || t("Sin correo disponible")}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" /> {usuario.telefono || t("Sin teléfono")}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" /> {usuario.ubicacion || t("Sin ubicación")}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <IdCard className="h-4 w-4" /> {usuario.documento || t("Sin documento")}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
              <Calendar className="h-4 w-4" /> {t("Alta:")} {formatearFecha(usuario.created_at, idioma)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserRound className="h-4 w-4" /> {" "}{t("Recibidos")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recibidos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wrench className="h-4 w-4" /> {" "}{t("Prestados")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{prestados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Briefcase className="h-4 w-4" /> {" "}{t("Completados")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{completados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("Volumen contratado")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatearMoneda(volumen, idioma)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Historial de trabajos y justificantes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsuarioTrabajos trabajos={trabajos} usuarioId={usuario.id} />
        </CardContent>
      </Card>
    </div>
  )
}
