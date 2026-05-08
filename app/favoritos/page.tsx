import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { obtenerFavoritos } from "@/app/actions/favoritos"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Heart, MapPin, Star, Briefcase } from "lucide-react"
import { FavoriteButton } from "@/components/favorite-button"

export const metadata = {
  title: "Favoritos - Diime",
  description: "Tus profesionales guardados",
}

export default async function FavoritosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase!.auth.getUser()

  if (!user) {
    redirect("/auth/login?redirect=/favoritos")
  }

  const { data: favoritos } = await obtenerFavoritos()

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="size-10 rounded-full bg-rose-100 dark:bg-rose-950/30 flex items-center justify-center">
          <Heart className="size-5 text-rose-500 fill-rose-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Mis Favoritos</h1>
      </div>
      <p className="text-muted-foreground mb-8">
        Profesionales que has guardado para contactar mas tarde
      </p>

      {!favoritos || favoritos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <Heart className="size-12 mx-auto text-muted-foreground/50" />
            <EmptyTitle>Aun no tienes favoritos</EmptyTitle>
            <EmptyDescription>
              Guarda profesionales para contactarlos rapidamente cuando los necesites
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild className="mt-4">
            <Link href="/profesionales">Explorar profesionales</Link>
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoritos.map((fav: any) => {
            const prof = fav.profesional
            if (!prof) return null
            const nombreCompleto = `${prof.nombre || ""} ${prof.apellido || ""}`.trim()
            return (
              <Card key={fav.id} className="group overflow-hidden hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <Link href={`/profesional/${prof.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="size-14 ring-2 ring-background">
                        <AvatarImage src={prof.foto_perfil || undefined} alt={nombreCompleto} />
                        <AvatarFallback>{(prof.nombre || "?")[0]}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-semibold truncate group-hover:text-primary transition-colors">
                          {nombreCompleto || "Profesional"}
                        </p>
                        {prof.titulo && (
                          <p className="text-sm text-muted-foreground truncate">{prof.titulo}</p>
                        )}
                      </div>
                    </Link>
                    <FavoriteButton profesionalId={prof.id} initialIsFavorite={true} />
                  </div>

                  <div className="space-y-2 text-sm">
                    {prof.ubicacion && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="size-4" />
                        <span className="truncate">{prof.ubicacion}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      {prof.rating_promedio !== undefined && prof.rating_promedio !== null && (
                        <div className="flex items-center gap-1">
                          <Star className="size-4 fill-amber-400 text-amber-400" />
                          <span className="font-medium">{Number(prof.rating_promedio).toFixed(1)}</span>
                        </div>
                      )}
                      {prof.total_trabajos !== undefined && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Briefcase className="size-4" />
                          <span>{prof.total_trabajos} trabajos</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    {prof.tarifa_por_hora ? (
                      <span className="text-sm">
                        <span className="text-muted-foreground">Desde </span>
                        <span className="font-semibold">{prof.tarifa_por_hora}€/h</span>
                      </span>
                    ) : (
                      <span />
                    )}
                    <Button asChild size="sm">
                      <Link href={`/profesional/${prof.id}`}>Ver perfil</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
