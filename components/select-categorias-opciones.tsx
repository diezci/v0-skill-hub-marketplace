import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select"
import { GRUPOS_CATEGORIAS } from "@/lib/categorias"

// Opciones de subcategoría agrupadas por bloque/categoría para un <Select> de
// shadcn. Todos los desplegables de categorías de la web deben usar esto para
// que la taxonomía sea idéntica en todas partes.
export function OpcionesCategorias() {
  return (
    <>
      {GRUPOS_CATEGORIAS.map((g) => (
        <SelectGroup key={g.grupo}>
          <SelectLabel>{g.grupo}</SelectLabel>
          {g.subcategorias.map((s) => (
            <SelectItem key={s.nombre} value={s.nombre}>
              {s.nombre}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  )
}
