import type { Metadata } from "next"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import FreelancerRegistration from "@/components/freelancer-registration"
import ComingSoonTest from "@/components/coming-soon-test"
import DemandasServicios from "@/components/demandas-servicios"

export const metadata: Metadata = {
  title: "Ofrecer Servicios - SkillHub",
  description: "Regístrate como profesional y muestra tus habilidades a clientes en toda España",
}

export default function RegisterFreelancerPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col space-y-4 mb-8 text-center">
          <h1 className="text-3xl font-bold">Ofrece tus Servicios Profesionales</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Únete a nuestra comunidad de profesionales cualificados y comienza a ganar dinero haciendo lo que te
            apasiona.
          </p>
        </div>

        <Tabs defaultValue="demandas" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="demandas">Ver Demandas</TabsTrigger>
            <TabsTrigger value="registro">Registrarse</TabsTrigger>
          </TabsList>

          <TabsContent value="demandas">
            <DemandasServicios />
          </TabsContent>

          <TabsContent value="registro">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <FreelancerRegistration />
              <ComingSoonTest />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
