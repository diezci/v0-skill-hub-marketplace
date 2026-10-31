import { localeDe, type Idioma, traducir } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

// Datos completos de una contratación para su propuesta, justificante y desglose.
// Solo las partes con acceso económico vigente (o un admin) pueden verlos.
export async function obtenerDatosContratacion(trabajoId: string) {
  const supabase = await createClient()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: documento, error: errorDocumento } = await supabase.rpc("documento_contratacion", {
    p_trabajo_id: trabajoId,
  })
  if (errorDocumento || !documento?.trabajo) return null
  const trabajo = documento.trabajo

  // El rol admin se comprueba siempre, incluso si esa misma cuenta coincide
  // excepcionalmente con una de las partes. Inferirlo como "no es parte" hacía
  // que un admin participante no pudiera abrir las dos vistas documentales.
  const { data: perfilActual, error: errorPerfil } = await supabase
    .from("profiles")
    .select("es_admin, cuenta_eliminada")
    .eq("id", user.id)
    .maybeSingle()
  if (errorPerfil || !perfilActual || perfilActual.cuenta_eliminada) return null
  const esAdmin = !!perfilActual?.es_admin
  const [clienteActual, proveedorActual] = await Promise.all([
    supabase.rpc("empresa_puede_operar_trabajo", {
      p_trabajo_id: trabajo.id, p_permiso: "ver_cobros", p_parte: "cliente",
    }),
    supabase.rpc("empresa_puede_operar_trabajo", {
      p_trabajo_id: trabajo.id, p_permiso: "ver_cobros", p_parte: "proveedor",
    }),
  ])
  if (clienteActual.error || proveedorActual.error) return null
  // Los autores contractuales permanecen sellados. La consulta y su vista
  // económica dependen del operador o administrador empresarial actual.
  const esCliente = clienteActual.data === true
  const esProfesional = proveedorActual.data === true
  if (!esCliente && !esProfesional && !esAdmin) return null

  const [clienteR, profesionalR, proDatosR, escrowR] = await Promise.all([
    supabase.from("profiles").select("nombre, apellido, ubicacion").eq("id", trabajo.cliente_id).maybeSingle(),
    supabase.from("profiles").select("nombre, apellido, ubicacion").eq("id", trabajo.profesional_id).maybeSingle(),
    supabase.from("profesionales").select("titulo").eq("id", trabajo.profesional_id).maybeSingle(),
    supabase
      .from("transacciones_escrow")
      .select("*")
      .eq("trabajo_id", trabajo.id)
      .order("created_at", { ascending: false }),
  ])

  const errorCarga = [clienteR, profesionalR, proDatosR, escrowR].find(
    (resultado: any) => resultado?.error,
  )?.error
  if (errorCarga) return null

  const estadosContratados = new Set([
    "retenido",
    "fondos_retenidos",
    "liberado",
    "completado",
    "reembolsado",
    "disputa",
  ])
  const escrows = (escrowR.data as any[] | null) || []
  // Un reintento de checkout pendiente puede ser más nuevo que el pago que sí
  // se completó. El justificante debe usar primero la transacción económica real.
  const escrow =
    escrows.find((fila) => fila.fecha_retencion || estadosContratados.has(fila.estado)) ?? escrows[0] ?? null
  const contratado = !!escrow && (!!escrow.fecha_retencion || estadosContratados.has(escrow.estado))

  // Datos fiscales de ambas partes: si actúan por una empresa se identifica a la
  // empresa (con su CIF) y a quien actúa en su nombre.
  // Va por RPC porque `empresas` tiene RLS y cada parte no puede leer la empresa
  // de la otra; la función solo responde a las partes de este trabajo.
  const { data: facturacion, error: errorFacturacion } = await supabase.rpc("facturacion_trabajo", {
    p_trabajo_id: trabajo.id,
  })
  if (errorFacturacion) return null
  const facturacionPor = (parte: "cliente" | "profesional") =>
    (facturacion as any[] | null)?.find((f) => f.parte === parte) ?? null

  // Rol del que consulta: condiciona qué información económica se muestra
  // (cada parte solo ve su propia comisión; un admin lo ve todo).
  // El correo ya no se lee de `profiles` (ver scripts/043). Va por RPC, que solo
  // devuelve contactos autorizados. Puede no devolver el contacto personal
  // histórico a un operador nuevo; no se amplía ese permiso desde esta vista.
  const { data: contactos, error: errorContactos } = await supabase.rpc("contacto_perfiles", {
    p_ids: [trabajo.cliente_id, trabajo.profesional_id],
  })
  if (errorContactos) return null
  const emailDe = (id: string) => (contactos as any[] | null)?.find((c) => c.id === id)?.email ?? null

  return {
    trabajo,
    cliente: clienteR.data ? { ...clienteR.data, email: emailDe(trabajo.cliente_id) } : clienteR.data,
    profesional: profesionalR.data
      ? { ...profesionalR.data, email: emailDe(trabajo.profesional_id) }
      : profesionalR.data,
    tituloProfesional: proDatosR.data?.titulo ?? null,
    oferta: documento.oferta,
    solicitud: documento.solicitud,
    escrow,
    contratado,
    facturacionCliente: facturacionPor("cliente"),
    facturacionProfesional: facturacionPor("profesional"),
    esCliente,
    esProfesional,
    esAdmin,
  }
}

export function formatearEuros(n: number | null | undefined, idioma: Idioma = "es"): string {
  const v = Number(n || 0)
  return new Intl.NumberFormat(localeDe(idioma), { style: "currency", currency: "EUR" }).format(v)
}

export function formatearFechaLarga(fecha?: string | null, idioma: Idioma = "es"): string {
  if (!fecha) return "—"
  return new Date(fecha).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "long", year: "numeric" })
}

export function etiquetaMateriales(valor?: string | null, idioma: Idioma = "es"): string {
  const t = (clave: string) => traducir(idioma, clave)
  if (!valor) return t("No especificado")
  if (valor === "si") return t("Incluidos en el precio")
  if (valor === "no") return t("No incluidos (a cargo del cliente)")
  if (valor === "parcial") return t("Parcialmente incluidos")
  return valor
}
