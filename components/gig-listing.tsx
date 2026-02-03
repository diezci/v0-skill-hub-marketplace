"use client"

import { useState } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, Grid3X3, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import Link from "next/link"

const gigs = [
  {
    id: 1,
    title: "Reforma Integral de Viviendas",
    description: "Realizo reformas completas de pisos y casas con más de 15 años de experiencia",
    price: 3500,
    category: "Albañilería",
    image:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 87,
    freelancer: {
      name: "Carlos Rodríguez",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg",
      level: "Profesional Certificado",
    },
  },
  {
    id: 2,
    title: "Instalación de Fontanería Completa",
    description: "Instalación y reparación de sistemas de agua, calefacción y gas certificado",
    price: 450,
    category: "Fontanería",
    image:
      "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.8,
    reviews: 124,
    freelancer: {
      name: "Miguel Ángel Torres",
      avatar: "https://randomuser.me/api/portraits/men/45.jpg",
      level: "Experto Verificado",
    },
  },
  {
    id: 3,
    title: "Instalaciones Eléctricas Certificadas",
    description: "Electricista certificado para instalaciones residenciales y comerciales",
    price: 380,
    category: "Electricidad",
    image:
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 156,
    freelancer: {
      name: "Javier Martínez",
      avatar: "https://randomuser.me/api/portraits/men/22.jpg",
      level: "Experto Verificado",
    },
  },
  {
    id: 4,
    title: "Pintura Profesional Interior y Exterior",
    description: "Servicio de pintura con acabados de alta calidad y garantía de 2 años",
    price: 850,
    category: "Pintura",
    image:
      "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.7,
    reviews: 93,
    freelancer: {
      name: "Antonio López",
      avatar: "https://randomuser.me/api/portraits/men/56.jpg",
      level: "Profesional Certificado",
    },
  },
  {
    id: 5,
    title: "Carpintería a Medida",
    description: "Diseño y fabricación de muebles personalizados, armarios empotrados y cocinas",
    price: 1200,
    category: "Carpintería",
    image:
      "https://images.unsplash.com/photo-1617806118233-18e1de247200?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 78,
    freelancer: {
      name: "Francisco Gómez",
      avatar: "https://randomuser.me/api/portraits/men/76.jpg",
      level: "Maestro Artesano",
    },
  },
  {
    id: 6,
    title: "Instalación de Aire Acondicionado",
    description: "Instalación y mantenimiento de sistemas de climatización con garantía oficial",
    price: 680,
    category: "Climatización",
    image:
      "https://images.unsplash.com/photo-1631545806609-c2ce1e6e4e0c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.8,
    reviews: 112,
    freelancer: {
      name: "Roberto Sánchez",
      avatar: "https://randomuser.me/api/portraits/men/60.jpg",
      level: "Técnico Certificado",
    },
  },
  {
    id: 7,
    title: "Diseño de Jardines y Paisajismo",
    description: "Diseño, instalación y mantenimiento de jardines residenciales y comerciales",
    price: 950,
    category: "Jardinería",
    image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.7,
    reviews: 64,
    freelancer: {
      name: "Luis Fernández",
      avatar: "https://randomuser.me/api/portraits/men/18.jpg",
      level: "Especialista",
    },
  },
  {
    id: 8,
    title: "Instalación de Puertas Blindadas",
    description: "Cerrajero profesional especializado en seguridad del hogar",
    price: 420,
    category: "Cerrajería",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 89,
    freelancer: {
      name: "Pedro Ramírez",
      avatar: "https://randomuser.me/api/portraits/men/62.jpg",
      level: "Experto Verificado",
    },
  },
  {
    id: 9,
    title: "Proyectos Arquitectónicos Completos",
    description: "Arquitecto colegiado para diseño de viviendas, reformas y dirección de obra",
    price: 2500,
    category: "Arquitectura",
    image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 45,
    freelancer: {
      name: "Elena García",
      avatar: "https://randomuser.me/api/portraits/women/28.jpg",
      level: "Arquitecto Colegiado",
    },
  },
  {
    id: 10,
    title: "Instalación de Suelos y Alicatados",
    description: "Especialista en instalación de parquet, tarima, gres y cerámica",
    price: 720,
    category: "Albañilería",
    image:
      "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.8,
    reviews: 102,
    freelancer: {
      name: "José Manuel Ruiz",
      avatar: "https://randomuser.me/api/portraits/men/42.jpg",
      level: "Profesional Certificado",
    },
  },
  {
    id: 11,
    title: "Diseño de Interiores Personalizado",
    description: "Interiorista profesional para proyectos residenciales y comerciales",
    price: 1800,
    category: "Arquitectura",
    image:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.9,
    reviews: 67,
    freelancer: {
      name: "María Jiménez",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg",
      level: "Diseñadora Profesional",
    },
  },
  {
    id: 12,
    title: "Reparación de Electrodomésticos",
    description: "Técnico especializado en reparación de lavadoras, frigoríficos y hornos",
    price: 85,
    category: "Electricidad",
    image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80",
    rating: 4.6,
    reviews: 134,
    freelancer: {
      name: "David Moreno",
      avatar: "https://randomuser.me/api/portraits/men/54.jpg",
      level: "Técnico Certificado",
    },
  },
]

const GigListing = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState("recommended")

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-muted-foreground">
            Mostrando <span className="font-medium">{gigs.length}</span> resultados
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recomendados</SelectItem>
              <SelectItem value="price-low">Precio: Menor a Mayor</SelectItem>
              <SelectItem value="price-high">Precio: Mayor a Menor</SelectItem>
              <SelectItem value="rating">Mejor Valorados</SelectItem>
              <SelectItem value="newest">Más Recientes</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-none", viewMode === "grid" && "bg-muted")}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="sr-only">Vista de cuadrícula</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-none", viewMode === "list" && "bg-muted")}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
              <span className="sr-only">Vista de lista</span>
            </Button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gigs.map((gig) => (
            <Link key={gig.id} href={`/profesional/${gig.id}`}>
              <Card className="h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-1 cursor-pointer">
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={gig.image || "/placeholder.svg"}
                    alt={gig.title}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <Badge className="absolute top-2 right-2">{gig.category}</Badge>
                </div>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{gig.freelancer.name}</p>
                      <p className="text-xs text-muted-foreground">{gig.freelancer.level}</p>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{gig.title}</h3>
                  <p className="text-muted-foreground mb-4 line-clamp-2">{gig.description}</p>
                  <div className="flex items-center space-x-1 text-amber-500">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="font-medium">{gig.rating}</span>
                    <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                  </div>
                </CardContent>
                <CardFooter className="p-6 pt-0 border-t flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">Desde</p>
                  <p className="text-xl font-bold">€{gig.price}</p>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {gigs.map((gig) => (
            <Link key={gig.id} href={`/profesional/${gig.id}`}>
              <Card className="overflow-hidden transition-all duration-200 hover:shadow-md cursor-pointer">
                <div className="flex flex-col md:flex-row">
                  <div className="relative md:w-1/4 h-48 md:h-auto overflow-hidden">
                    <img
                      src={gig.image || "/placeholder.svg"}
                      alt={gig.title}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                    <Badge className="absolute top-2 right-2">{gig.category}</Badge>
                  </div>
                  <div className="flex-1 p-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={gig.freelancer.avatar || "/placeholder.svg"} />
                        <AvatarFallback>{gig.freelancer.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{gig.freelancer.name}</p>
                        <p className="text-xs text-muted-foreground">{gig.freelancer.level}</p>
                      </div>
                      <div className="ml-auto flex items-center space-x-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="font-medium">{gig.rating}</span>
                        <span className="text-muted-foreground text-sm">({gig.reviews})</span>
                      </div>
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{gig.title}</h3>
                    <p className="text-muted-foreground mb-4">{gig.description}</p>
                    <div className="flex justify-between items-center mt-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Desde</p>
                        <p className="text-xl font-bold">€{gig.price}</p>
                      </div>
                      <Button>Ver Detalles</Button>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex justify-center mt-8">
        <Button variant="outline" className="mx-2 bg-transparent">
          Anterior
        </Button>
        <Button variant="outline" className="mx-2 bg-primary text-primary-foreground">
          1
        </Button>
        <Button variant="outline" className="mx-2 bg-transparent">
          2
        </Button>
        <Button variant="outline" className="mx-2 bg-transparent">
          3
        </Button>
        <Button variant="outline" className="mx-2 bg-transparent">
          Siguiente
        </Button>
      </div>
    </div>
  )
}

export default GigListing
