import { Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { urgencia } from "@/lib/urgencias"

type PlazoNecesidadProps = {
  valor: string | null | undefined
  className?: string
}

/**
 * Explica el plazo elegido al publicar la demanda. El prefijo evita que una
 * chapita como "Urgente" se confunda con el estado de la publicación.
 */
export function PlazoNecesidad({ valor, className }: PlazoNecesidadProps) {
  const opcion = urgencia(valor)

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 whitespace-normal text-left font-normal", opcion.color, className)}
      title={`El cliente necesita el trabajo: ${opcion.etiqueta}`}
    >
      <Clock aria-hidden="true" />
      Se necesita: {opcion.etiqueta}
    </Badge>
  )
}
