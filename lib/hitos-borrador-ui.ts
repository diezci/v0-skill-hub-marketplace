import { z } from "zod"

// Los borradores aceptan campos incompletos; el servidor valida el plan antes
// de enviarlo. Así, cerrar la sesión no pierde una fase que aún se está editando.
export const hitosBorradorSchema = z.array(z.object({
  id: z.string().uuid(), titulo: z.string().max(160), descripcion: z.string().max(2000).optional(),
  criterio_aceptacion: z.string().max(2000), fecha_limite: z.string().max(20),
  importe_centimos: z.number().int().min(-1).max(100000000),
})).max(20)
