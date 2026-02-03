import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, MapPin, Euro } from "lucide-react"

interface PortfolioItem {
  id: number
  title: string
  description: string
  image: string
  category: string
  completedDate: string
  client?: string
  location?: string
  duration?: string
  budget?: string
}

export default function ProfilePortfolio({ portfolio }: { portfolio: PortfolioItem[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Portfolio de Trabajos Completados</CardTitle>
          <Badge variant="secondary">{portfolio.length} proyectos</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolio.map((item) => (
            <div key={item.id} className="group cursor-pointer">
              <div className="relative h-56 overflow-hidden rounded-lg mb-3 shadow-md">
                <img
                  src={item.image || "/placeholder.svg"}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
                <Badge className="absolute top-3 right-3 shadow-lg">{item.category}</Badge>
              </div>
              <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{item.title}</h3>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{item.description}</p>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Completado: {item.completedDate}</span>
                </div>
                {item.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{item.location}</span>
                  </div>
                )}
                {item.duration && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Duración: {item.duration}</span>
                  </div>
                )}
                {item.budget && (
                  <div className="flex items-center gap-1.5">
                    <Euro className="h-3.5 w-3.5" />
                    <span>Presupuesto: {item.budget}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
