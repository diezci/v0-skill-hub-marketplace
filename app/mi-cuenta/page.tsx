import { getT } from "@/lib/i18n-servidor"
import { SelectorIdioma } from "@/components/selector-idioma"
import type { Metadata } from "next"
import Link from "next/link"
import LogoutButton from "@/components/logout-button"
import { CambiarContrasenaForm } from "@/components/cambiar-contrasena-form"
import { ReportarIncidenciaDialog } from "@/components/reportar-incidencia-dialog"
import { EliminarCuentaDialog } from "@/components/eliminar-cuenta-dialog"
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
  BadgeCheck,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PreferenciaEmails } from "@/components/preferencia-emails"
import { PreferenciaPush } from "@/components/preferencia-push"
import { redirect } from "next/navigation"
import { formatearFecha } from "@/lib/utils"
import { preferenciasEmailDesdeFila } from "@/lib/preferencias-notificaciones"

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t("Configuración - Diime"), description: t("Gestiona tu cuenta y preferencias") }
}

export default async function MiCuentaPage() {
  const { t, idioma } = await getT()
  const supabase = await createClient()
  if (!supabase) redirect("/auth/login")

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const [{ data: profile }, { data: profesional }, { data: preferenciasEmail }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nombre, apellido, verificado, created_at, email_notificaciones")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("profesionales").select("id").eq("id", user.id).maybeSingle(),
    supabase
      .from("preferencias_notificaciones")
      .select(
        "email_activo, email_oportunidades, email_ofertas, email_proyectos, email_pagos, email_disputas, email_cuenta",
      )
      .eq("usuario_id", user.id)
      .maybeSingle(),
  ])

  const esProfesional = !!profesional
  const preferenciasEmailIniciales = preferenciasEmailDesdeFila(
    preferenciasEmail,
    profile?.email_notificaciones !== false,
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("Configuración")}</h1>
        <p className="text-muted-foreground">{t("Gestiona tu cuenta y preferencias")}</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>{t("Idioma")}</CardTitle><CardDescription>{t("Elige el idioma de Diime")}</CardDescription></CardHeader>
          <CardContent><SelectorIdioma /></CardContent>
        </Card>
        {/* Cuenta */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Cuenta")}</CardTitle>
            <CardDescription>{t("Datos de acceso y tipo de cuenta")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-1">{t("Correo electrónico")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("Sesión iniciada como")} <span className="font-medium text-foreground">{user.email}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={esProfesional ? "border-emerald-500/40 text-emerald-600" : ""}>
                {esProfesional ? t("Profesional") : t("Cliente")}
              </Badge>
              {profile?.verificado && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                  <BadgeCheck className="h-3.5 w-3.5" /> {t("Verificado")}
                </Badge>
              )}
              {profile?.created_at && (
                <span className="text-xs text-muted-foreground">
                  {t("Miembro desde")} {formatearFecha(profile.created_at, idioma)}
                </span>
              )}
            </div>
            {!esProfesional && (
              <Button asChild variant="outline" size="sm" className="bg-transparent">
                <Link href="/convertirse-profesional">
                  <Briefcase className="h-4 w-4 mr-2" />
                  {t("Convertirme en profesional")}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Avisos */}
        <Card id="avisos-email" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("Avisos")}</CardTitle>
            <CardDescription>{t("Cómo te avisamos de lo que pasa en tus proyectos")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferenciaEmails inicial={preferenciasEmailIniciales} esProfesional={esProfesional} />
          </CardContent>
        </Card>

        {/* Mi actividad */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Mi actividad")}</CardTitle>
            <CardDescription>{t("Accede a tu perfil y tus solicitudes")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-between bg-transparent">
              <Link href="/mi-perfil">
                <span className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  {t("Mi Perfil")}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between bg-transparent">
              <Link href="/mis-solicitudes">
                <span className="flex items-center gap-2">
                  <Inbox className="h-4 w-4" />
                  {t("Mis Solicitudes")}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Seguridad */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Seguridad")}</CardTitle>
            <CardDescription>{t("Cambia la contraseña de tu cuenta")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CambiarContrasenaForm />
          </CardContent>
        </Card>

        {/* Notificaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> {t("Notificaciones")}
            </CardTitle>
            <CardDescription>{t("Cómo te avisamos de la actividad en tu cuenta")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("Verás un contador en el menú y una vista previa cuando recibas un mensaje, una oferta o una novedad de tus proyectos.")}
            </p>
            <PreferenciaPush />
          </CardContent>
        </Card>

        {/* Soporte */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Soporte")}</CardTitle>
            <CardDescription>{t("¿Algo no funciona como esperabas?")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportarIncidenciaDialog
              triggerLabel="Reportar un problema"
              triggerVariant="outline"
              triggerSize="default"
            />
          </CardContent>
        </Card>

        {/* Zona de peligro */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">{t("Zona de peligro")}</CardTitle>
            <CardDescription>{t("Cerrar sesión o darte de baja")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-1">{t("Cerrar sesión")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t("Cierra tu sesión para entrar con otra cuenta o registrar una nueva.")}
              </p>
              <LogoutButton />
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-medium mb-1">{t("Eliminar mi cuenta")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t("Cierra tu cuenta al instante, sin pedírselo a soporte. Antes de confirmar te diremos exactamente qué pasa con tus demandas, tus trabajos en marcha y el dinero que haya de por medio.")}
              </p>
              <EliminarCuentaDialog />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
