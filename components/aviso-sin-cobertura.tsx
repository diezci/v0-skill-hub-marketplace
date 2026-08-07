import Link from "next/link"
import { BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

/**
 * Avisa al profesional de que no le va a llegar ninguna demanda mientras no
 * diga a qué se dedica y dónde trabaja.
 *
 * El emparejamiento filtra por `categorias_interes` y `provincias_cobertura`
 * (ver buscarYEnviarInvitaciones), así que con esos campos vacíos NO se recibe
 * nada. Ese aviso ya existía dentro de /mi-perfil, pero ahí solo lo veía quien
 * ya había entrado a configurarlo: justo el que no lo necesita. Va donde el
 * profesional pasa el rato —Mis Pujas y Gestión de proyectos—, que es donde se
 * pregunta por qué no le llega trabajo.
 *
 * No renderiza nada si no es profesional o si ya lo tiene puesto.
 */
export async function AvisoSinCobertura() {
  const supabase = await createClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profesional } = await supabase
    .from("profesionales")
    .select("categorias_interes, provincias_cobertura")
    .eq("id", user.id)
    .maybeSingle()

  if (!profesional) return null

  const sinServicios = (profesional.categorias_interes ?? []).length === 0
  const sinProvincias = (profesional.provincias_cobertura ?? []).length === 0
  if (!sinServicios && !sinProvincias) return null

  const queFalta = sinServicios && sinProvincias
    ? "a qué te dedicas ni dónde trabajas"
    : sinServicios
      ? "a qué te dedicas"
      : "dónde trabajas"

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <BellOff className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-700 dark:text-amber-400">No te estamos avisando de demandas nuevas</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Todavía no nos has dicho {queFalta}, y es lo que usamos para saber qué demandas mandarte. Hasta que lo
          completes no recibirás ninguna.
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white">
        <Link href="/mi-perfil">Completar mi perfil</Link>
      </Button>
    </div>
  )
}
