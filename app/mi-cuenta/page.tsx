import type { Metadata } from "next"
import Link from "next/link"
import LogoutButton from "@/components/logout-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { UserCircle, Inbox, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Configuración</h1>
        <p className="text-muted-foreground">Gestiona tu cuenta y preferencias</p>
      </div>

      <div className="space-y-6">
        {/* Accesos directos a las secciones (cada una con su página propia) */}
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

        {/* Cuenta y sesión */}
        <Card>
          <CardHeader>
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>Datos de acceso y sesión</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-1">Correo electrónico</h3>
              <p className="text-sm text-muted-foreground">
                Sesión iniciada como <span className="font-medium text-foreground">{user.email}</span>
              </p>
            </div>
            <Separator />
            <div>
              <h3 className="text-sm font-medium mb-1">Cerrar sesión</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Cierra tu sesión para entrar con otra cuenta o registrar una nueva.
              </p>
              <LogoutButton />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
