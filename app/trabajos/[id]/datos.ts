import { createClient } from "@/lib/supabase/server"

// Datos completos de una contratación para los documentos (contrato y factura).
// Solo las partes del trabajo (o un admin) pueden verlos.
export async function obtenerDatosContratacion(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: trabajo } = await supabase.from("trabajos").select("*").eq("id", trabajoId).maybeSingle()
  if (!trabajo) return null

  if (trabajo.cliente_id !== user.id && trabajo.profesional_id !== user.id) {
    const { data: perfil } = await supabase.from("profiles").select("es_admin").eq("id", user.id).maybeSingle()
    if (!perfil?.es_admin) return null
  }

  const [clienteR, profesionalR, proDatosR, ofertaR, solicitudR, escrowR] = await Promise.all([
    supabase.from("profiles").select("nombre, apellido, email, ubicacion").eq("id", trabajo.cliente_id).maybeSingle(),
    supabase.from("profiles").select("nombre, apellido, email, ubicacion").eq("id", trabajo.profesional_id).maybeSingle(),
    supabase.from("profesionales").select("titulo").eq("id", trabajo.profesional_id).maybeSingle(),
    trabajo.oferta_id
      ? supabase.from("ofertas").select("*").eq("id", trabajo.oferta_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    trabajo.solicitud_id
      ? supabase
          .from("solicitudes")
          .select("titulo, descripcion, ubicacion, archivos")
          .eq("id", trabajo.solicitud_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase
      .from("transacciones_escrow")
      .select("*")
      .eq("trabajo_id", trabajo.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Datos de facturación de ambas partes: si actúan por una empresa, la factura
  // va a nombre de la empresa (con su CIF) indicando quién actúa en su nombre.
  // Va por RPC porque `empresas` tiene RLS y cada parte no puede leer la empresa
  // de la otra; la función solo responde a las partes de este trabajo.
  const { data: facturacion } = await supabase.rpc("facturacion_trabajo", { p_trabajo_id: trabajo.id })
  const facturacionPor = (parte: "cliente" | "profesional") =>
    (facturacion as any[] | null)?.find((f) => f.parte === parte) ?? null

  // Rol del que consulta: condiciona qué información económica se muestra
  // (cada parte solo ve su propia comisión; un admin lo ve todo).
  const esCliente = trabajo.cliente_id === user.id
  const esProfesional = trabajo.profesional_id === user.id

  return {
    trabajo,
    cliente: clienteR.data,
    profesional: profesionalR.data,
    tituloProfesional: proDatosR.data?.titulo ?? null,
    oferta: ofertaR.data,
    solicitud: solicitudR.data,
    escrow: escrowR.data,
    facturacionCliente: facturacionPor("cliente"),
    facturacionProfesional: facturacionPor("profesional"),
    esCliente,
    esProfesional,
    esAdmin: !esCliente && !esProfesional,
  }
}

export function formatearEuros(n: number | null | undefined): string {
  const v = Number(n || 0)
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v)
}

export function formatearFechaLarga(fecha?: string | null): string {
  if (!fecha) return "—"
  return new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
}

export function etiquetaMateriales(valor?: string | null): string {
  if (!valor) return "No especificado"
  if (valor === "si") return "Incluidos en el precio"
  if (valor === "no") return "No incluidos (a cargo del cliente)"
  if (valor === "parcial") return "Parcialmente incluidos"
  return valor
}
