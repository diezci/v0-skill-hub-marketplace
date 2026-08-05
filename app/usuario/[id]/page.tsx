import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MapPin, CalendarDays, BadgeCheck, Briefcase, UserX } from "lucide-react"
import { formatearFecha } from "@/lib/utils"

export const dynamic = "force-dynamic"

// Perfil público de CUALQUIER usuario, sea cliente o profesional.
//
// Existe porque hasta ahora solo había ficha de profesional (/profesional/[id],
// que hace notFound() si esa persona no lo es), así que el nombre de un cliente
// no podía enlazarse a ningún sitio sin dar un 404.
//
// Solo muestra datos públicos: nombre, foto, ubicación, descripción y
// antigüedad. Nada de correo, teléfono ni DNI, que dejaron de ser legibles al
// cerrar la fuga de datos personales (ver scripts/043).
export default async function PerfilUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!supabase) notFound()

  // Si es profesional, su ficha es más completa (tarifa, valoraciones,
  // portfolio): se manda allí en vez de mantener dos páginas parecidas.
  const { data: esProfesional } = await supabase.from("profesionales").select("id").eq("id", id).maybeSingle()
  if (esProfesional) redirect(`/profesional/${id}`)

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, nombre, apellido, foto_perfil, foto_portada, ubicacion, bio, verificado, created_at, cuenta_eliminada")
    .eq("id", id)
    .maybeSingle()

  if (!perfil) notFound()

  // Cuántos trabajos ha contratado: da contexto sin exponer nada privado.
  const { count: contratados } = await supabase
    .from("trabajos")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", id)
    .eq("estado", "completado")

  const nombre = `${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`.trim() || "Usuario"

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card className="overflow-hidden">
        <div className="h-32 sm:h-40 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 relative">
          {perfil.foto_portada && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={perfil.foto_portada} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-16">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-md">
              <AvatarImage src={perfil.foto_perfil || "/placeholder.svg"} />
              <AvatarFallback className="text-2xl">
                {perfil.nombre?.[0]}
                {perfil.apellido?.[0]}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold truncate">{nombre}</h1>
                {/* El nombre se conserva a propósito (ver scripts/046): quien
                    trabajó con esta persona tiene que poder identificarla para
                    reclamar. Pero deja claro que ya no está. */}
                {perfil.cuenta_eliminada ? (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1">
                    <UserX className="h-3.5 w-3.5" /> Cuenta eliminada
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                    Cliente
                  </Badge>
                )}
                {perfil.verificado && !perfil.cuenta_eliminada && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verificado
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                {perfil.ubicacion && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {perfil.ubicacion}
                  </span>
                )}
                {perfil.created_at && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    Miembro desde {formatearFecha(perfil.created_at)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" />
                  {contratados ?? 0} trabajo{(contratados ?? 0) !== 1 ? "s" : ""} contratado
                  {(contratados ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          {perfil.bio && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sobre mí</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{perfil.bio}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
