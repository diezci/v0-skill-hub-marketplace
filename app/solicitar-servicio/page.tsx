import type { Metadata } from "next"
import ServiceRequestWizard from "@/components/service-request-wizard"

export const metadata: Metadata = {
  title: "Solicitar Servicio | Diime",
  description: "Describe tu proyecto paso a paso y encuentra profesionales cualificados",
}

export default function SolicitarServicioPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Solicitar un servicio</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Cuéntanos qué necesitas y nuestra IA encontrará a los mejores profesionales para tu proyecto
        </p>
      </div>
      <ServiceRequestWizard />
    </div>
  )
}
