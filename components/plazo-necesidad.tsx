"use client"

import { localeDe, type Idioma } from "@/lib/i18n"
import { useIdioma } from "@/components/idioma-provider"
import { Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { urgencia } from "@/lib/urgencias"

type PlazoNecesidadProps = {
  valor: string | null | undefined
  fecha?: string | null
  className?: string
}

function formatearFecha(fecha: string, idioma: Idioma) {
  const [year, month, day] = fecha.split("-").map(Number)
  return new Intl.DateTimeFormat(localeDe(idioma), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

/**
 * Explica el plazo elegido al publicar la demanda. El prefijo evita que una
 * chapita como "Urgente" se confunda con el estado de la publicación.
 */
export function PlazoNecesidad({ valor, fecha, className }: PlazoNecesidadProps) {
  const { t, idioma } = useIdioma()
  const opcion = urgencia(valor)
  const plazo = fecha ? t("el {fecha}", { fecha: formatearFecha(fecha, idioma) }) : t(opcion.etiqueta)

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 whitespace-normal text-left font-normal", opcion.color, className)}
      title={t("El cliente necesita el trabajo: {plazo}", { plazo })}
    >
      <Clock aria-hidden="true" />
       {t("Se necesita:")} {plazo}
    </Badge>
  )
}
