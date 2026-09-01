"use server"

import { createClient } from "@/lib/supabase/server"

export interface AdminPersonaTrabajo {
  id: string
  nombre: string | null
  apellido: string | null
  foto_perfil: string | null
  ubicacion: string | null
}

export interface AdminEscrowTrabajo {
  id: string
  estado: string | null
  monto: number | null
  monto_base: number | null
  comision_cliente: number | null
  comision_proveedor: number | null
  pago_neto_proveedor: number | null
  monto_reembolsado: number | null
  fecha_retencion: string | null
  fecha_liberacion: string | null
  created_at: string | null
}

export interface AdminTrabajo {
  id: string
  titulo: string
  descripcion: string | null
  cliente_id: string
  profesional_id: string
  precio_acordado: number
  estado: string
  fecha_inicio: string | null
  fecha_fin: string | null
  created_at: string
  contratado: boolean
  cliente: AdminPersonaTrabajo | null
  profesional: AdminPersonaTrabajo | null
  escrow: AdminEscrowTrabajo | null
}

export interface AdminUsuarioDetalle {
  id: string
  nombre: string | null
  apellido: string | null
  foto_perfil: string | null
  ubicacion: string | null
  tipo_usuario: string | null
  verificado: boolean
  es_admin: boolean
  created_at: string | null
  email: string | null
  telefono: string | null
  documento: string | null
  profesional: {
    titulo: string | null
    rating_promedio: number | null
    total_reseñas: number | null
    total_trabajos: number | null
  } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ESTADOS_ESCROW_CONTRATADOS = new Set([
  "retenido",
  "fondos_retenidos",
  "liberado",
  "completado",
  "reembolsado",
  "disputa",
])

const numeroONull = (valor: unknown): number | null => {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

const escrowContratado = (escrow: any) =>
  !!escrow && (!!escrow.fecha_retencion || ESTADOS_ESCROW_CONTRATADOS.has(escrow.estado))

const trocear = <T,>(valores: T[], tamaño: number): T[][] => {
  const partes: T[][] = []
  for (let indice = 0; indice < valores.length; indice += tamaño) {
    partes.push(valores.slice(indice, indice + tamaño))
  }
  return partes
}

async function requerirAdmin() {
  const supabase = await createClient()
  if (!supabase) return { error: "Base de datos no disponible", supabase: null, userId: null }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado", supabase: null, userId: null }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("es_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!perfil?.es_admin) {
    return { error: "No tienes permiso para consultar trabajos y facturas", supabase: null, userId: null }
  }

  return { error: null, supabase, userId: user.id }
}

async function cargarTrabajos(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, usuarioId?: string) {
  // PostgREST limita por defecto el número de filas. Recorremos páginas para
  // que "todos los trabajos" no se convierta silenciosamente en los primeros
  // 1.000 cuando crezca la plataforma.
  const filas: any[] = []
  const tamanoPagina = 500
  for (let desde = 0; ; desde += tamanoPagina) {
    let consulta = supabase
      .from("trabajos")
      .select(
        "id, titulo, descripcion, cliente_id, profesional_id, precio_acordado, estado, fecha_inicio, fecha_fin, created_at",
      )
      .order("created_at", { ascending: false })
      .range(desde, desde + tamanoPagina - 1)

    if (usuarioId) {
      consulta = consulta.or(`cliente_id.eq.${usuarioId},profesional_id.eq.${usuarioId}`)
    }

    const { data, error } = await consulta
    if (error) return { error: error.message, data: [] as AdminTrabajo[] }
    const pagina = (data as any[]) || []
    filas.push(...pagina)
    if (pagina.length < tamanoPagina) break
  }

  const trabajoIds = filas.map((trabajo) => trabajo.id)
  const personaIds = [
    ...new Set(filas.flatMap((trabajo) => [trabajo.cliente_id, trabajo.profesional_id]).filter(Boolean)),
  ] as string[]

  // Los `.in(...)` también viajan en la URL; se trocean para evitar superar
  // su longitud máxima cuando haya muchos trabajos o participantes.
  const [resultadosPerfiles, resultadosEscrow] = await Promise.all([
    Promise.all(
      trocear(personaIds, 200).map((ids) =>
        supabase.from("profiles").select("id, nombre, apellido, foto_perfil, ubicacion").in("id", ids),
      ),
    ),
    Promise.all(
      trocear(trabajoIds, 100).map((ids) =>
        supabase
          .from("transacciones_escrow")
          .select(
            "id, trabajo_id, estado, monto, monto_base, comision_cliente, comision_proveedor, pago_neto_proveedor, monto_reembolsado, fecha_retencion, fecha_liberacion, created_at",
          )
          .in("trabajo_id", ids)
          .order("created_at", { ascending: false }),
      ),
    ),
  ])

  const errorPerfiles = resultadosPerfiles.find((resultado) => resultado.error)?.error
  const errorEscrow = resultadosEscrow.find((resultado) => resultado.error)?.error
  if (errorPerfiles) return { error: errorPerfiles.message, data: [] as AdminTrabajo[] }
  if (errorEscrow) return { error: errorEscrow.message, data: [] as AdminTrabajo[] }

  const filasPerfiles = resultadosPerfiles.flatMap((resultado) => (resultado.data as any[]) || [])
  const filasEscrow = resultadosEscrow.flatMap((resultado) => (resultado.data as any[]) || [])

  const perfiles = new Map<string, AdminPersonaTrabajo>(
    filasPerfiles.map((perfil) => [perfil.id, perfil]),
  )
  const escrows = new Map<string, any>()
  for (const escrow of filasEscrow) {
    const actual = escrows.get(escrow.trabajo_id)
    // Cada lote viene de más reciente a más antiguo. Si existe un intento de
    // pago pendiente posterior, no debe ocultar la transacción que sí llegó a
    // retenerse o cerrarse.
    if (!actual || (!escrowContratado(actual) && escrowContratado(escrow))) {
      escrows.set(escrow.trabajo_id, escrow)
    }
  }

  const trabajos: AdminTrabajo[] = filas.map((trabajo) => {
    const escrow = escrows.get(trabajo.id)
    return {
      ...trabajo,
      precio_acordado: numeroONull(trabajo.precio_acordado) ?? 0,
      contratado: escrowContratado(escrow),
      cliente: perfiles.get(trabajo.cliente_id) ?? null,
      profesional: perfiles.get(trabajo.profesional_id) ?? null,
      escrow: escrow
        ? {
            id: escrow.id,
            estado: escrow.estado ?? null,
            monto: numeroONull(escrow.monto),
            monto_base: numeroONull(escrow.monto_base),
            comision_cliente: numeroONull(escrow.comision_cliente),
            comision_proveedor: numeroONull(escrow.comision_proveedor),
            pago_neto_proveedor: numeroONull(escrow.pago_neto_proveedor),
            monto_reembolsado: numeroONull(escrow.monto_reembolsado),
            fecha_retencion: escrow.fecha_retencion ?? null,
            fecha_liberacion: escrow.fecha_liberacion ?? null,
            created_at: escrow.created_at ?? null,
          }
        : null,
    }
  })

  return { error: null, data: trabajos }
}

export async function obtenerTrabajosAdmin() {
  const acceso = await requerirAdmin()
  if (!acceso.supabase) return { error: acceso.error, data: [] as AdminTrabajo[] }
  return cargarTrabajos(acceso.supabase)
}

export async function obtenerUsuarioConTrabajosAdmin(usuarioId: string) {
  if (!UUID_RE.test(usuarioId)) {
    return { error: "Usuario no válido", data: null }
  }

  const acceso = await requerirAdmin()
  if (!acceso.supabase) return { error: acceso.error, data: null }
  const supabase = acceso.supabase

  const [perfilResultado, profesionalResultado, contactoResultado, trabajosResultado] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre, apellido, foto_perfil, ubicacion, tipo_usuario, verificado, es_admin, created_at")
      .eq("id", usuarioId)
      .maybeSingle(),
    supabase
      .from("profesionales")
      .select("titulo, rating_promedio, total_reseñas, total_trabajos")
      .eq("id", usuarioId)
      .maybeSingle(),
    supabase.rpc("contacto_perfiles", { p_ids: [usuarioId] }),
    cargarTrabajos(supabase, usuarioId),
  ])

  if (perfilResultado.error) return { error: perfilResultado.error.message, data: null }
  if (!perfilResultado.data) return { error: "Usuario no encontrado", data: null }
  if (profesionalResultado.error) return { error: profesionalResultado.error.message, data: null }
  if (contactoResultado.error) return { error: contactoResultado.error.message, data: null }
  if (trabajosResultado.error) return { error: trabajosResultado.error, data: null }

  const contacto = ((contactoResultado.data as any[]) || [])[0]
  // El parser de tipos de Supabase no reconoce bien la ñ de `total_reseñas`
  // en una cadena select, aunque PostgreSQL sí. Normalizamos la fila aquí.
  const profesionalFila = profesionalResultado.data as any
  const profesional = profesionalFila
    ? {
        ...profesionalFila,
        rating_promedio: numeroONull(profesionalFila.rating_promedio),
        total_reseñas: numeroONull(profesionalFila.total_reseñas),
        total_trabajos: numeroONull(profesionalFila.total_trabajos),
      }
    : null

  const usuario: AdminUsuarioDetalle = {
    ...perfilResultado.data,
    verificado: !!perfilResultado.data.verificado,
    es_admin: !!perfilResultado.data.es_admin,
    email: contacto?.email ?? null,
    telefono: contacto?.telefono ?? null,
    documento: contacto?.documento ?? null,
    profesional,
  }

  return {
    error: null,
    data: {
      usuario,
      trabajos: trabajosResultado.data,
      adminId: acceso.userId,
    },
  }
}
