import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Esta página tenía su propio formulario de alta profesional, pero era un
// duplicado peor que el editor de /mi-perfil: solo pedía título, habilidades,
// tarifa y años, y NO permitía elegir categorías ni provincias, que es
// justamente lo que decide de qué demandas se recibe aviso. Se mantenía la
// ruta porque la enlazan el hero, el footer, la home y mi-cuenta.
//
// Ahora solo encamina, respetando el orden natural: primero se completa el
// registro normal de usuario y, ya con cuenta, se completa el perfil
// profesional en /mi-perfil (donde están todos los campos, incluidos los
// servicios y las provincias de los que quiere recibir demandas).
export const dynamic = "force-dynamic"

export default async function ConvertirseEnProfesionalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } }

  if (!user) {
    // Sin cuenta todavía: primero el registro clásico. Al volver a esta ruta ya
    // registrado, se le llevará a completar su perfil profesional.
    redirect("/auth/registro?siguiente=profesional")
  }

  redirect("/mi-perfil?completar=profesional")
}
