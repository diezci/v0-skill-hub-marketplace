import type { Metadata } from "next"
import MisSolicitudes from "@/components/mis-solicitudes"
import MisOfertas from "@/components/mis-ofertas"
import MisTrabajos from "@/components/mis-trabajos"
import EditarPerfil from "@/components/editar-perfil"
import PortfolioManager from "@/components/portfolio-manager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { User, FileText, Settings, Briefcase, Hammer, MessageSquare } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Mi Cuenta - SkillHub",
  description: "Gestiona tus solicitudes de servicio y perfil",
}

export default async function MiCuentaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profesional } = await supabase.from("profesionales").select("id").eq("id", user.id).single()

  const isProfesional = !!profesional

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Mi Cuenta</h1>
        <p className="text-muted-foreground">Gestiona tus solicitudes de servicio y configuración de perfil</p>
      </div>

      <Tabs defaultValue="solicitudes" className="space-y-6">
        <TabsList className={`grid w-full ${isProfesional ? "grid-cols-6" : "grid-cols-4"} lg:w-auto`}>
          <TabsTrigger value="solicitudes" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Solicitudes</span>
            <span className="sm:hidden">Solic.</span>
          </TabsTrigger>
          {isProfesional && (
            <TabsTrigger value="ofertas" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Ofertas</span>
              <span className="sm:hidden">Ofertas</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="trabajos" className="gap-2">
            <Hammer className="h-4 w-4" />
            <span className="hidden sm:inline">Trabajos</span>
            <span className="sm:hidden">Trabajos</span>
          </TabsTrigger>
          <TabsTrigger value="perfil" className="gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Perfil</span>
            <span className="sm:hidden">Perfil</span>
          </TabsTrigger>
          {isProfesional && (
            <TabsTrigger value="portfolio" className="gap-2">
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Portfolio</span>
              <span className="sm:hidden">Portfolio</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="configuracion" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
            <span className="sm:hidden">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="solicitudes" className="space-y-4">
          <MisSolicitudes />
        </TabsContent>

        {isProfesional && (
          <TabsContent value="ofertas" className="space-y-4">
            <MisOfertas />
          </TabsContent>
        )}

        <TabsContent value="trabajos" className="space-y-4">
          <MisTrabajos />
        </TabsContent>

        <TabsContent value="perfil" className="space-y-4">
          <EditarPerfil />
        </TabsContent>

        {isProfesional && (
          <TabsContent value="portfolio" className="space-y-4">
            <PortfolioManager profesionalId={user.id} />
          </TabsContent>
        )}

        <TabsContent value="configuracion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Cuenta</CardTitle>
              <CardDescription>Gestiona tus preferencias y configuración de privacidad</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Funcionalidad de configuración próximamente disponible</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
