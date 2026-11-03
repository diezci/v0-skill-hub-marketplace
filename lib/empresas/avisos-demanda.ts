import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cubreZonaDeAvisos, encajaEnPresupuestoDeAvisos } from "@/lib/filtros-notificaciones"

type Demanda = { cliente_id: string; empresa_id?: string | null; ubicacion: string | null; presupuesto_min: number | null; presupuesto_max: number | null }

/** Called only after the publishing action has authenticated the demand author. */
export async function destinatariosDemandaEmpresa(admin: SupabaseClient, demanda: Demanda, categoria: string): Promise<{ id: string; empresaId: string }[]> {
  const { data: empresas, error } = await admin.from("empresas")
    .select("id, propietario_id, provincias, presupuesto_min_interes, presupuesto_max_interes")
    .eq("estado_verificacion", "verificada").contains("servicios", [categoria])
  if (error) throw new Error("No se pudieron consultar las preferencias de las empresas.")
  const candidatas = (empresas || []).filter((empresa) => empresa.id !== demanda.empresa_id)
    .filter((empresa) => cubreZonaDeAvisos(demanda.ubicacion, empresa.provincias))
    .filter((empresa) => encajaEnPresupuestoDeAvisos(demanda.presupuesto_min, demanda.presupuesto_max, empresa.presupuesto_min_interes, empresa.presupuesto_max_interes))
  if (!candidatas.length) return []
  const { data: miembros, error: errorMiembros } = await admin.from("empresa_miembros")
    .select("usuario_id, empresa_id, permisos").eq("estado", "activo").in("empresa_id", candidatas.map((empresa) => empresa.id))
  if (errorMiembros) throw new Error("No se pudo comprobar el acceso a las empresas.")
  const ids = [...new Set([...candidatas.map((empresa) => empresa.propietario_id), ...(miembros || []).map((miembro) => miembro.usuario_id)])]
  const { data: perfiles, error: errorPerfiles } = await admin.from("profiles").select("id").in("id", ids).is("cuenta_eliminada", null)
  if (errorPerfiles) throw new Error("No se pudo comprobar el acceso a las empresas.")
  const activos = new Set((perfiles || []).map((perfil) => perfil.id))
  // A member cannot receive opportunities to bid against their own company,
  // including demands that member published using their personal identity.
  const propias = new Set((miembros || []).filter((miembro) => miembro.usuario_id === demanda.cliente_id).map((miembro) => miembro.empresa_id))
  const empresasActivas = new Set(candidatas.filter((empresa) => activos.has(empresa.propietario_id) && !propias.has(empresa.id)).map((empresa) => empresa.id))
  return (miembros || []).filter((miembro) => empresasActivas.has(miembro.empresa_id) && activos.has(miembro.usuario_id)
    && miembro.usuario_id !== demanda.cliente_id && miembro.permisos?.presupuestos === true)
    .map((miembro) => ({ id: miembro.usuario_id as string, empresaId: miembro.empresa_id as string }))
}
