import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, MessageCircle, HelpCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "Centro de ayuda | Diime",
  description: "Resolvemos tus dudas sobre cómo funciona Diime.",
}

const faqs = [
  {
    q: "¿Cómo publico una demanda de servicio?",
    a: 'Ve a "Publicar proyecto" en el menú principal. Describe lo que necesitas, selecciona la categoría, tu provincia y el presupuesto estimado. En pocas horas recibirás ofertas de profesionales.',
  },
  {
    q: "¿Cómo funciona el sistema de pagos escrow?",
    a: "Cuando aceptas una oferta, el pago queda retenido en una cuenta segura (escrow). El dinero se libera al profesional solo cuando confirmas que el trabajo está completado a tu satisfacción.",
  },
  {
    q: "¿Cómo sé que un profesional es de confianza?",
    a: "Todos los profesionales pasan por un proceso de verificación. Además, puedes ver sus valoraciones y reseñas de trabajos anteriores, sus certificaciones y su historial en la plataforma.",
  },
  {
    q: "¿Puedo cancelar un trabajo contratado?",
    a: "Sí. Si el trabajo aún no ha comenzado, puedes cancelarlo y recibirás el reembolso completo. Si ya está en progreso, se aplica la política de cancelación parcial según los términos acordados.",
  },
  {
    q: "¿Cómo me registro como profesional?",
    a: 'Crea tu cuenta de usuario y luego accede a "Conviértete en profesional" desde el menú. Completa tu perfil con tu especialidad, tarifas y experiencia. Nuestro equipo revisará tu solicitud.',
  },
  {
    q: "¿Cuál es la comisión de Diime?",
    a: "Diime cobra una pequeña comisión sobre el valor del trabajo completado. Esta comisión cubre el seguro del pago escrow, la verificación de profesionales y el soporte de la plataforma.",
  },
]

export default function Ayuda() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="text-center mb-12">
        <HelpCircle className="h-12 w-12 text-primary mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-4">Centro de ayuda</h1>
        <p className="text-lg text-muted-foreground">Respuestas a las preguntas más frecuentes sobre Diime.</p>
      </div>

      <div className="space-y-4 mb-14">
        {faqs.map((faq) => (
          <Card key={faq.q}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{faq.q}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
        <h2 className="text-xl font-bold mb-2">¿No encuentras lo que buscas?</h2>
        <p className="text-muted-foreground mb-6">Nuestro equipo está disponible para ayudarte con cualquier duda.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Button asChild variant="outline">
            <a href="mailto:contacto@diime.es">
              <Mail className="h-4 w-4 mr-2" />
              contacto@diime.es
            </a>
          </Button>
          <Button asChild>
            <Link href="/mensajes">
              <MessageCircle className="h-4 w-4 mr-2" />
              Abrir chat de soporte
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
