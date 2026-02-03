"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, MapPin, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { obtenerProfesionalesDestacados } from "@/app/actions/profiles"

interface FeaturedGig {
  id: string
  title: string
  description: string
  price: number
  category: string
  image: string
  rating: number
  reviews: number
  location?: string
  verified?: boolean
  freelancer: {
    name: string
    avatar: string
    level: string
  }
}

const fallbackGigs: FeaturedGig[] = [
  {
    id: "1",
    title: "Albañilería Profesional",
    description: "Construcción y reformas con más de 15 años de experiencia",
    price: 35,
    category: "Albañilería",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80",
    rating: 4.9,
    reviews: 127,
    location: "Madrid",
    verified: true,
    freelancer: { name: "Carlos Rodríguez", avatar: "/placeholder.svg", level: "Experto" },
  },
  {
    id: "2",
    title: "Fontanería 24h",
    description: "Reparaciones urgentes e instalaciones",
    price: 40,
    category: "Fontanería",
    image: "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400&q=80",
    rating: 4.8,
    reviews: 89,
    location: "Barcelona",
    verified: true,
    freelancer: { name: "María García", avatar: "/placeholder.svg", level: "Experta" },
  },
  {
    id: "3",
    title: "Electricista Certificado",
    description: "Instalaciones eléctricas y certificados",
    price: 45,
    category: "Electricidad",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80",
    rating: 4.9,
    reviews: 156,
    location: "Valencia",
    verified: true,
    freelancer: { name: "Antonio López", avatar: "/placeholder.svg", level: "Experto" },
  },
  {
    id: "4",
    title: "Pintura y Decoración",
    description: "Acabados profesionales interior y exterior",
    price: 30,
    category: "Pintura",
    image: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&q=80",
    rating: 4.7,
    reviews: 73,
    location: "Sevilla",
    verified: true,
    freelancer: { name: "Elena Martín", avatar: "/placeholder.svg", level: "Profesional" },
  },
]

const FeaturedGigs = () => {
  const [gigs, setGigs] = useState<FeaturedGig[]>(fallbackGigs)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFeaturedGigs()
  }, [])

  const loadFeaturedGigs = async () => {
    try {
      const professionals = await obtenerProfesionalesDestacados()
      if (professionals && Array.isArray(professionals) && professionals.length > 0) {
        const formattedGigs = professionals.map((prof) => ({
          id: prof.id,
          title: prof.titulo_profesional,
          description: prof.descripcion_breve || "Profesional cualificado",
          price: prof.tarifa_hora || 50,
          category: prof.categoria || "Servicios",
          image: prof.foto_portada || "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&q=80",
          rating: prof.rating_promedio || 5.0,
          reviews: prof.total_reviews || 0,
          location: prof.ubicacion || "España",
          verified: prof.verificado || false,
          freelancer: {
            name: prof.nombre_completo || "Profesional",
            avatar: prof.foto_perfil || "/placeholder.svg",
            level: prof.nivel_experiencia || "Profesional",
          },
        }))
        setGigs(formattedGigs)
      }
    } catch (error) {
      console.error("[v0] Error loading featured gigs:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Profesionales destacados</h2>
          <p className="text-muted-foreground">Los mejor valorados por nuestros clientes</p>
        </div>
        <Link href="/gigs" className="text-sm text-primary hover:underline hidden sm:block">
          Ver todos
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-40 bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-3 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {gigs.map((gig) => (
            <Link key={gig.id} href={`/profesional/${gig.id}`}>
              <Card className="overflow-hidden card-hover cursor-pointer group h-full">
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={gig.image || "/placeholder.svg"}
                    alt={gig.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <Badge className="absolute top-3 left-3 bg-background/90 text-foreground hover:bg-background/90">
                    {gig.category}
                  </Badge>
                  {gig.verified && (
                    <div className="absolute top-3 right-3 bg-primary/90 text-primary-foreground rounded-full p-1">
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border-2 border-background">
                        <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="text-white">
                        <p className="text-sm font-medium leading-none">{gig.freelancer.name}</p>
                        <p className="text-xs opacity-80">{gig.freelancer.level}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-semibold mb-1 line-clamp-1">{gig.title}</h3>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{gig.description}</p>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-amber-500">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span className="font-medium">{gig.rating.toFixed(1)}</span>
                        <span className="text-muted-foreground">({gig.reviews})</span>
                      </span>
                      {gig.location && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {gig.location}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-primary">{gig.price}€/h</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default FeaturedGigs
