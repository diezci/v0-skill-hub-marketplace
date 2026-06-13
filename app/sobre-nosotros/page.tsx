import type { Metadata } from "next"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Users, Shield, Star } from "lucide-react"

export const metadata: Metadata = {
  title: "Sobre nosotros | Diime",
  description: "Conoce Diime, la plataforma española que conecta profesionales cualificados con clientes.",
}

export default function SobreNosotros() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 border border-primary/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Hecho en España
        </div>
        <h1 className="text-4xl font-bold mb-4">Sobre Diime</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Somos la plataforma que conecta a personas que necesitan servicios del hogar y la construcción con
          profesionales verificados de toda España.
        </p>
      </div>

      <div className="prose prose-neutral dark:prose-invert max-w-none mb-14 space-y-6 text-muted-foreground leading-relaxed">
        <p>
          Diime nació de una necesidad real: encontrar un fontanero, electricista o carpintero de confianza siempre
          ha sido complicado. Las plataformas genéricas no estaban pensadas para los servicios de economía real —
          esos que requieren presencia física, negociación de plazos y garantías de calidad.
        </p>
        <p>
          Nuestra misión es democratizar el acceso a profesionales cualificados en toda España, ofreciendo a los
          clientes transparencia en precios y valoraciones, y a los profesionales una herramienta para conseguir
          trabajo de calidad sin comisiones abusivas.
        </p>
        <p>
          El sistema de pagos escrow de Diime protege tanto al cliente como al profesional: el dinero queda
          retenido hasta que el trabajo esté completado y ambas partes estén satisfechas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {[
          { icon: Users, title: "5.000+ profesionales", desc: "Verificados en todas las provincias de España" },
          { icon: Shield, title: "Pagos seguros", desc: "Sistema escrow que protege tu dinero hasta la entrega" },
          { icon: Star, title: "4.9 de valoración", desc: "Media de satisfacción de clientes en la plataforma" },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border p-6 text-center">
            <item.icon className="h-8 w-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">¿Tienes alguna pregunta?</h2>
        <p className="text-muted-foreground mb-6">
          Escríbenos a{" "}
          <a href="mailto:contacto@diime.es" className="text-primary hover:underline">
            contacto@diime.es
          </a>{" "}
          o visita nuestro centro de ayuda.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/ayuda">Centro de ayuda</Link>
          </Button>
          <Button asChild>
            <Link href="/profesionales">Explorar profesionales</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
