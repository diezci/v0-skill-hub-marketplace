import type { Metadata } from "next"
import Link from "next/link"
import LogoutButton from "@/components/logout-button"
import { CambiarContrasenaForm } from "@/components/cambiar-contrasena-form"
import { ReportarIncidenciaDialog } from "@/components/reportar-incidencia-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  UserCircle,
  Inbox,
  ChevronRight,
  Briefcase,
  Bell,
  ShieldAlert,
  Trash2,
  BadgeCheck,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { formatearFecha } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Configuración - Diime",
  description: "Gestiona tu cuenta y preferencias",
}

export default async function MiCuentaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nombre, apellido, verificado, created_at")
    .eq("id", user.id)
    .maybeSingle()

  const { data: profesional } = await supabase
    .from("profesionales")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  const esProfesional = !!profesional

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Configuración</h1>
        <p className="text-muted-foreground">Gestiona tu cuenta y preferencias</p>
      </div>

      <div className="space-y-6">
        {/* Cuenta */}
        <Card>
          <CardHeader>
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>Datos de acceso y tipo de cuenta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-1">Correo electrónico</h3>
              <p className="text-sm text-muted-foreground">
                Sesión iniciada como <span className="font-medium text-foreground">{user.email}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={esProfesional ? "border-emerald-500/40 text-emerald-600" : ""}>
                {esProfesional ? "Profesional" : "Cliente"}
              </Badge>
              {profile?.verificado && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                </Badge>
              )}
              {profile?.created_at && (
                <span className="text-xs text-muted-foreground">
                  Miembro desde {formatearFecha(profile.created_at)}
                </span>
              )}
            </div>
            {!esProfesional && (
              <Button asChild variant="outline" size="sm" className="bg-transparent">
                <Link href="/convertirse-profesional">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Convertirme en profesional
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Mi actividad */}
        <Card>
          <CardHeader>
            <CardTitle>Mi actividad</CardTitle>
            <CardDescription>Accede a tu perfil y tus solicitudes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between bg-transparent">
              <Link href="/mi-perfil">
                <span className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  Mi Perfil
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between bg-transparent">
              <Link href="/mis-solicitudes">
                <span className="flex items-center gap-2">
                  <Inbox className="h-4 w-4" />
                  Mis Solicitudes
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Seguridad */}
        <Card>
          <CardHeader>
            <CardTitle>Seguridad</CardTitle>
            <CardDescription>Cambia la contraseña de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <CambiarContrasenaForm />
          </CardContent>
        </Card>

        {/* Notificaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notificaciones
            </CardTitle>
            <CardDescription>Cómo te avisamos de la actividad en tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Verás un aviso en la campana del menú cuando recibas un mensaje nuevo, alguien oferte en una demanda
              que has publicado, o te acepten una oferta que hayas enviado.
            </p>
          </CardContent>
        </Card>

        {/* Soporte */}
        <Card>
          <CardHeader>
            <CardTitle>Soporte</CardTitle>
            <CardDescription>¿Algo no funciona como esperabas?</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportarIncidenciaDialog
              trigger={
                <Button variant="outline" className="bg-transparent gap-2">
                  <ShieldAlert className="h-4 w-4" />
                  Reportar un problema
                </Button>
              }
            />
          </CardContent>
        </Card>

        {/* Zona de peligro */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Zona de peligro</CardTitle>
            <CardDescription>Cerrar sesión o solicitar la baja de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-1">Cerrar sesión</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Cierra tu sesión para entrar con otra cuenta o registrar una nueva.
              </p>
              <LogoutButton />
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-medium mb-1">Eliminar mi cuenta</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Enviamos tu solicitud a soporte, que la gestionará manualmente para asegurarse de que no queden
                trabajos, pagos o disputas abiertas.
              </p>
              <ReportarIncidenciaDialog
                asuntoInicial="Solicitud de eliminación de cuenta"
                categoriaInicial="otro"
                descripcionPlaceholder="Confírmanos que quieres eliminar tu cuenta y por qué, así podemos gestionarlo cuanto antes..."
                trigger={
                  <Button variant="outline" className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10 gap-2">
                    <Trash2 className="h-4 w-4" />
                    Solicitar eliminación de cuenta
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
