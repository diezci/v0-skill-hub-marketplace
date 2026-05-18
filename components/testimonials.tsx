"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react"
import { Button } from "@/components/ui/button"

const testimonials = [
  {
    id: 1,
    content:
      "Encontre al fontanero perfecto para mi reforma en menos de 24 horas. El trabajo quedo impecable y el precio fue muy competitivo. Volvere a usar Diime sin duda.",
    name: "Laura Fernandez",
    role: "Propietaria, Madrid",
    initial: "LF",
    rating: 5,
  },
  {
    id: 2,
    content:
      "Como electricista, Diime me ha permitido encontrar clientes de calidad de forma constante. La plataforma es muy intuitiva y los pagos siempre llegan a tiempo.",
    name: "Miguel Sanchez",
    role: "Electricista profesional",
    initial: "MS",
    rating: 5,
  },
  {
    id: 3,
    content:
      "El sistema de pagos seguros me da mucha tranquilidad. Contrate a un pintor y no se libero el pago hasta que el trabajo estuvo terminado a mi gusto. Recomendado al 100%.",
    name: "Ana Garcia",
    role: "Cliente, Barcelona",
    initial: "AG",
    rating: 5,
  },
  {
    id: 4,
    content:
      "Tras anos buscando trabajos por mi cuenta, Diime me ha simplificado todo. Ahora puedo centrarme en lo que mejor hago: ofrecer servicios de calidad a mis clientes.",
    name: "Roberto Martinez",
    role: "Albañil",
    initial: "RM",
    rating: 5,
  },
]

const Testimonials = () => {
  const [current, setCurrent] = useState(0)

  // Auto-rotate every 7 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % testimonials.length)
    }, 7000)
    return () => clearInterval(interval)
  }, [])

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length)
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  const t = testimonials[current]

  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <div className="text-center mb-12">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 tracking-wide uppercase">
          Testimonios
        </span>
        <h2 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-balance">
          Lo que dicen quienes ya nos usan
        </h2>
        <p className="text-muted-foreground text-lg">Miles de clientes y profesionales confian en Diime cada dia</p>
      </div>

      <div className="max-w-3xl mx-auto relative">
        <Card className="relative p-8 md:p-12 bg-gradient-to-br from-card to-card/50 border-border/50 overflow-hidden">
          {/* Decorative quote mark */}
          <Quote
            className="absolute top-6 right-6 h-20 w-20 text-primary/10"
            strokeWidth={1.5}
            aria-hidden="true"
          />

          <div className="relative">
            {/* Stars */}
            <div className="flex justify-center gap-1 mb-6">
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
              ))}
            </div>

            {/* Quote */}
            <p className="text-lg md:text-xl text-center text-foreground/90 leading-relaxed mb-8 text-pretty">
              {`"${t.content}"`}
            </p>

            {/* Author */}
            <div className="flex flex-col items-center">
              <Avatar className="h-14 w-14 mb-3 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{t.initial}</AvatarFallback>
              </Avatar>
              <h4 className="font-semibold">{t.name}</h4>
              <p className="text-sm text-muted-foreground">{t.role}</p>
            </div>
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-10 w-10 bg-transparent hover:bg-primary/5"
            onClick={prev}
            aria-label="Testimonio anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrent(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === current ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                aria-label={`Ir al testimonio ${index + 1}`}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-10 w-10 bg-transparent hover:bg-primary/5"
            onClick={next}
            aria-label="Siguiente testimonio"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Testimonials
