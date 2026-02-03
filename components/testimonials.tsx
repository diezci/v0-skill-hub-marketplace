"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const testimonials = [
  {
    id: 1,
    content:
      "Encontré al fontanero perfecto para mi reforma en menos de 24 horas. El trabajo quedó impecable y el precio fue muy competitivo.",
    name: "Laura Fernández",
    role: "Propietaria",
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    rating: 5,
  },
  {
    id: 2,
    content:
      "Como electricista, SkillHub me ha permitido encontrar clientes de calidad constantemente. La plataforma es muy intuitiva.",
    name: "Miguel Sánchez",
    role: "Electricista",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    rating: 5,
  },
  {
    id: 3,
    content:
      "El sistema de pagos seguros me da mucha tranquilidad. Contraté un pintor y no pagué hasta que el trabajo estuvo terminado.",
    name: "Ana García",
    role: "Cliente",
    avatar: "https://randomuser.me/api/portraits/women/68.jpg",
    rating: 5,
  },
]

const Testimonials = () => {
  const [current, setCurrent] = useState(0)

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length)
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">Lo que dicen nuestros usuarios</h2>
        <p className="text-muted-foreground">Miles de clientes y profesionales confían en nosotros</p>
      </div>

      <div className="max-w-3xl mx-auto relative">
        <Card className="p-8 md:p-12 text-center bg-card/50 border-border/50">
          <div className="flex justify-center gap-1 mb-6">
            {[...Array(testimonials[current].rating)].map((_, i) => (
              <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
            ))}
          </div>

          <p className="text-lg md:text-xl mb-8 text-foreground/90 leading-relaxed">
            "{testimonials[current].content}"
          </p>

          <div className="flex flex-col items-center">
            <Avatar className="h-14 w-14 mb-3">
              <AvatarImage src={testimonials[current].avatar || "/placeholder.svg"} />
              <AvatarFallback>{testimonials[current].name.charAt(0)}</AvatarFallback>
            </Avatar>
            <h4 className="font-semibold">{testimonials[current].name}</h4>
            <p className="text-sm text-muted-foreground">{testimonials[current].role}</p>
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex justify-center gap-2 mt-6">
          <Button variant="outline" size="icon" className="rounded-full h-10 w-10 bg-transparent" onClick={prev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrent(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <Button variant="outline" size="icon" className="rounded-full h-10 w-10 bg-transparent" onClick={next}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  )
}

export default Testimonials
