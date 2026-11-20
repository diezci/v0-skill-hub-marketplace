import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { CATEGORIAS_SERVICIO_NOMBRES } from "../categorias"
import { PROVINCIAS_ES } from "../provincias"
import { PRECIO_MAX } from "../precios"
import { ACTORES_EMPRESA_LOCAL, crearDatosEmpresaIniciales, PERMISOS_BASE } from "./seed"
import type { ActorEmpresa, ActividadEmpresa, EmpresaFicha, EmpresaPublica, EspacioEmpresa, InvitacionEmpresa, MiembroEmpresa, MiembroEmpresaPublico, PermisoEmpresa, PermisosEmpresa, ResultadoEmpresa, RolEmpresa, SolicitudPresupuestoEmpresa, SolicitudVerificacionEmpresa } from "./types"

interface InvitacionPrivada extends InvitacionEmpresa { tokenHash: string; creadaPor: string }
interface DocumentoPrivado { id: string; archivo: string; sha256: string }
interface ImagenEmpresaLocal { id: string; empresaId: string; tipo: "image/png" | "image/jpeg" | "image/webp" }
export type InputPortfolioEmpresaLocal = {
  titulo: string; descripcion: string; imagen_url: string; categoria: string; fecha_completado: string
  ubicacion?: string; duracion?: string; presupuesto?: number | null; trabajo_id?: string
  evidencia_acreditacion?: string; contexto_proveedor?: string
}
export type InputRevisionPortfolioLocal = {
  tipo: "personal" | "empresa"; itemId: string; revisionId: string
  decision: "acreditado" | "requiere_informacion"; nota: string
}
interface ProyectoPortfolioLocal {
  id: string; empresa_id: string; trabajo_id: string | null; titulo: string; descripcion: string
  categoria: string; ubicacion: string; imagenes: string[]; duracion: string; fecha_proyecto: string
  presupuesto: number | null; contexto_proveedor: string; participantes_ids: string[]; created_at: string
  evidencia_acreditacion: string; acreditacion: "diime" | "pendiente" | "acreditado" | "requiere_informacion"
  nota_acreditacion: string | null; rango_precio?: string; revision_id: string; presentado_en: string
}
export interface EstadoEmpresaLocal extends ReturnType<typeof crearDatosEmpresaIniciales> {
  version: 1
  invitaciones: InvitacionPrivada[]
  verificacion: SolicitudVerificacionEmpresa | null
  documentos: DocumentoPrivado[]
  actividad: ActividadEmpresa[]
  solicitudes: SolicitudPresupuestoEmpresa[]
  proyectosPortfolio: ProyectoPortfolioLocal[]
  imagenesEmpresa: ImagenEmpresaLocal[]
  revisionesPortfolio: { itemId: string; revisionId: string; decision: string; nota: string; revisadoPor: string; fecha: string }[]
}

export type InputMiembro = { nombre: string; email: string; rol: Exclude<RolEmpresa, "principal">; permisos: PermisosEmpresa }
export type InputActualizarMiembro = { miembroId: string; rol: Exclude<RolEmpresa, "principal">; permisos: PermisosEmpresa }
export type DatosProfesionalesEmpresa = Pick<EmpresaFicha, "domicilio" | "titulo" | "telefono" | "emailContacto" | "tarifaHora" | "anosExperiencia" | "tiempoRespuesta" | "disponible" | "habilidades" | "certificaciones" | "idiomas">
export type InputPerfilEmpresa = { nombre: string; descripcion: string; web: string; ubicacion: string; provincias?: string[]; servicios: string[]; logoUrl?: string; portadaUrl?: string; presupuestoMinInteres?: number | null; presupuestoMaxInteres?: number | null } & DatosProfesionalesEmpresa
export type InputVerificacion = { metodo: "certificado" | "documental"; representanteNombre: string; cargoLegal: string; documentoNombre: string; documento: Uint8Array; consentimiento: boolean }

// The optional array distinguishes the canonical editor from older clients.
export function validarCoberturaEmpresa(input: Pick<InputPerfilEmpresa, "provincias" | "servicios">): ResultadoEmpresa<{ provincias: string[]; servicios: string[] } | null> {
  if (input.provincias === undefined) return { data: null }
  if (!Array.isArray(input.provincias) || !input.provincias.length || input.provincias.length > PROVINCIAS_ES.length ||
      !input.provincias.every((p) => typeof p === "string" && PROVINCIAS_ES.includes(p))) {
    return { error: "Selecciona al menos una provincia válida de la lista." }
  }
  if (!Array.isArray(input.servicios) || !input.servicios.length || input.servicios.length > CATEGORIAS_SERVICIO_NOMBRES.length ||
      !input.servicios.every((s) => typeof s === "string" && CATEGORIAS_SERVICIO_NOMBRES.includes(s))) {
    return { error: "Selecciona al menos un servicio válido de la lista." }
  }
  return { data: { provincias: [...new Set(input.provincias)], servicios: [...new Set(input.servicios)] } }
}

export function validarPreferenciasEmpresa(input: Pick<InputPerfilEmpresa, "presupuestoMinInteres" | "presupuestoMaxInteres">): ResultadoEmpresa<{ presupuestoMinInteres: number | null; presupuestoMaxInteres: number | null } | null> {
  const tieneMin = input.presupuestoMinInteres !== undefined
  const tieneMax = input.presupuestoMaxInteres !== undefined
  if (tieneMin !== tieneMax) return { error: "Guarda juntos el presupuesto mínimo y el máximo." }
  if (!tieneMin) return { data: null }
  const minimo = input.presupuestoMinInteres!
  const maximo = input.presupuestoMaxInteres!
  const valido = (v: number | null) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= PRECIO_MAX)
  if (!valido(minimo) || !valido(maximo)) return { error: "El presupuesto de los avisos debe estar entre 0 y 100.000 €." }
  if (minimo !== null && maximo !== null && minimo > maximo) return { error: "El presupuesto mínimo de los avisos no puede superar el máximo." }
  return { data: { presupuestoMinInteres: minimo === null || minimo <= 0 ? null : minimo, presupuestoMaxInteres: maximo === null || maximo >= PRECIO_MAX ? null : maximo } }
}

/** Business-owned fields only. Absent fields preserve values saved by newer clients. */
export function validarDatosProfesionalesEmpresa(input: DatosProfesionalesEmpresa): ResultadoEmpresa<DatosProfesionalesEmpresa | null> {
  const datos: DatosProfesionalesEmpresa = {}
  for (const [clave, maximo] of [["domicilio", 500], ["titulo", 160], ["telefono", 40], ["emailContacto", 254], ["tiempoRespuesta", 80]] as const) {
    const valor = input[clave]
    if (valor === undefined) continue
    if (typeof valor !== "string" || valor.length > maximo || (clave === "domicilio" ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(valor)) return { error: `Revisa el campo ${clave} de la empresa.` }
    datos[clave] = valor.trim()
  }
  if (datos.emailContacto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.emailContacto)) return { error: "Introduce un correo de contacto válido." }
  if (datos.emailContacto) datos.emailContacto = datos.emailContacto.toLowerCase()
  if (input.tarifaHora !== undefined) {
    if (input.tarifaHora !== null && (typeof input.tarifaHora !== "number" || !Number.isFinite(input.tarifaHora) || input.tarifaHora < 0 || input.tarifaHora > 100000)) return { error: "La tarifa por hora debe estar entre 0 y 100.000 €." }
    datos.tarifaHora = input.tarifaHora
  }
  if (input.anosExperiencia !== undefined) {
    if (!Number.isInteger(input.anosExperiencia) || input.anosExperiencia < 0 || input.anosExperiencia > 100) return { error: "Los años de experiencia deben ser un número entero entre 0 y 100." }
    datos.anosExperiencia = input.anosExperiencia
  }
  if (input.disponible !== undefined) {
    if (typeof input.disponible !== "boolean") return { error: "Revisa la disponibilidad de la empresa." }
    datos.disponible = input.disponible
  }
  for (const clave of ["habilidades", "certificaciones", "idiomas"] as const) {
    const lista = input[clave]
    if (lista === undefined) continue
    if (!Array.isArray(lista) || lista.length > 100 || lista.some((v) => typeof v !== "string" || !v.trim() || v.length > 300 || /[\u0000-\u001f\u007f]/.test(v))) return { error: `Revisa la lista de ${clave} de la empresa.` }
    datos[clave] = [...new Set(lista.map((v) => v.trim()))]
  }
  return { data: Object.keys(datos).length ? datos : null }
}

const CLAVES_PERMISOS: PermisoEmpresa[] = ["perfil", "mensajes", "presupuestos", "encargos", "equipo", "ver_cobros", "gestionar_cobros"]
const colas = (globalThis as typeof globalThis & { __diimeEmpresasColas?: Map<string, Promise<unknown>> }).__diimeEmpresasColas ??= new Map<string, Promise<unknown>>()
class ErrorEmpresa extends Error {}
function asegurar(condicion: unknown, mensaje: string): asserts condicion { if (!condicion) throw new ErrorEmpresa(mensaje) }
function texto(valor: unknown, nombre: string, min: number, max: number) {
  asegurar(typeof valor === "string", `${nombre}: introduce un texto válido.`)
  const limpio = valor.trim()
  asegurar(limpio.length >= min && limpio.length <= max, `${nombre}: debe tener entre ${min} y ${max} caracteres.`)
  asegurar(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(limpio), `${nombre}: contiene caracteres no válidos.`)
  return limpio
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex") }
function miembroPublico(miembro: MiembroEmpresa): MiembroEmpresaPublico {
  const { id, usuarioId, nombre, cargo, bio, habilidades, perfilPublico } = miembro
  return { id, usuarioId, nombre, cargo, bio, habilidades, perfilPublico }
}
function invitacionPublica(invitacion: InvitacionPrivada): InvitacionEmpresa {
  const { tokenHash: _hash, creadaPor: _creadaPor, ...publica } = invitacion
  return publica
}
function fichaPublica(estado: EstadoEmpresaLocal): EmpresaPublica {
  const { representanteNombre: _representante, cargoLegal: _cargo, presupuestoMinInteres: _min, presupuestoMaxInteres: _max, ...empresa } = estado.empresa
  empresa.proyectosCompletados = estado.contratosPortfolio.filter((t) => t.empresaId === estado.empresa.id && t.estado === "completado").length
  const trabajos = estado.proyectosPortfolio.filter((p) => p.trabajo_id
    ? estado.contratosPortfolio.some((t) => t.id === p.trabajo_id && t.empresaId === estado.empresa.id && t.estado === "completado")
    : p.acreditacion === "acreditado").map((p) => ({
      id: p.id, empresaId: p.empresa_id, trabajoId: p.trabajo_id || undefined,
      titulo: p.titulo, descripcion: p.descripcion, categoria: p.categoria, ubicacion: p.ubicacion,
      imagen: p.imagenes[0], imagenes: p.imagenes, duracion: p.duracion, contextoProveedor: p.contexto_proveedor,
      fecha: p.fecha_proyecto, participantesIds: p.participantes_ids, creadoEn: p.created_at,
      acreditacion: p.trabajo_id ? "diime" as const : "acreditado" as const,
      // Only a coarse range belongs in the public projection, never evidence or the exact amount.
      rangoPrecio: p.rango_precio || rangoPortfolioLocal(p.presupuesto),
    }))
  return { empresa, miembros: estado.miembros.filter((m) => m.estado === "activo" && m.perfilPublico).map(miembroPublico), trabajos, resenas: estado.resenas, local: true }
}
function rangoPortfolioLocal(importe: number | null) {
  if (!importe || importe <= 0) return ""
  const limites = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
  const superior = limites.findIndex((n) => importe < n)
  const formato = (n: number) => n.toLocaleString("es-ES")
  return superior === 0 ? "Hasta 100 €" : superior < 0 ? "Más de 100.000 €" : `${formato(limites[superior - 1])}–${formato(limites[superior])} €`
}
function esImagenGuardadaLocal(estado: EstadoEmpresaLocal, url: string) {
  const id = url.match(/^\/api\/empresas\/imagen-local\/([0-9a-f-]{36})$/)?.[1]
  return !!id && estado.imagenesEmpresa.some((imagen) => imagen.id === id && imagen.empresaId === estado.empresa.id)
}
function imagenLocalValida(bytes: Uint8Array, tipo: ImagenEmpresaLocal["tipo"]) {
  if (tipo === "image/png") return bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    && bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13 && Buffer.from(bytes.slice(12, 16)).toString() === "IHDR"
  if (tipo === "image/jpeg") return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  return tipo === "image/webp" && bytes.length >= 16 && Buffer.from(bytes.slice(0, 4)).toString() === "RIFF"
    && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(Buffer.from(bytes.slice(12, 16)).toString())
}
function portfolioInicial(estado: ReturnType<typeof crearDatosEmpresaIniciales>): ProyectoPortfolioLocal[] {
  return estado.trabajos.map((t) => {
    const contrato = estado.contratosPortfolio.find((c) => c.id === (t.trabajoId || t.id) && c.empresaId === estado.empresa.id && c.estado === "completado")
    return { id: t.id, empresa_id: t.empresaId, trabajo_id: contrato?.id || null, titulo: t.titulo, descripcion: t.descripcion,
      categoria: t.categoria, ubicacion: t.ubicacion, imagenes: t.imagenes || (t.imagen ? [t.imagen] : []), duracion: t.duracion || "",
      fecha_proyecto: t.fecha, presupuesto: contrato?.precioAcordado ?? null, contexto_proveedor: t.contextoProveedor || "",
      participantes_ids: t.participantesIds, created_at: t.creadoEn || `${t.fecha}T12:00:00.000Z`, rango_precio: t.rangoPrecio,
      evidencia_acreditacion: "", acreditacion: contrato ? "diime" : "pendiente", nota_acreditacion: null,
      revision_id: randomUUID(), presentado_en: t.creadoEn || `${t.fecha}T12:00:00.000Z` }
  })
}
function estadoInicial(): EstadoEmpresaLocal {
  const datos = crearDatosEmpresaIniciales()
  return { version: 1, ...datos, proyectosPortfolio: portfolioInicial(datos), imagenesEmpresa: [], revisionesPortfolio: [], invitaciones: [], verificacion: null, documentos: [], solicitudes: [], actividad: [{ id: "actividad-inicial", actorNombre: "Equipo Diime", accion: "Empresa de ejemplo preparada para la prueba local. La verificación inicial es ficticia.", fecha: "2026-09-17T08:00:00.000Z" }] }
}
function actorConocido(actor: ActorEmpresa) {
  const registrado = ACTORES_EMPRESA_LOCAL[actor.id]
  asegurar(registrado && registrado.nombre === actor.nombre && registrado.email === actor.email && registrado.plataformaAdmin === actor.plataformaAdmin, "Esta identidad no está disponible en la prueba local.")
  return registrado
}
function miembroActivo(estado: EstadoEmpresaLocal, actor: ActorEmpresa) {
  actorConocido(actor)
  return estado.miembros.find((m) => m.usuarioId === actor.id && m.estado === "activo") ?? null
}
function exigirPermiso(estado: EstadoEmpresaLocal, actor: ActorEmpresa, permiso: PermisoEmpresa) {
  const miembro = miembroActivo(estado, actor)
  asegurar(miembro?.permisos[permiso], "No tienes permiso para realizar esta acción en nombre de la empresa.")
  return miembro
}
function exigirPrincipal(estado: EstadoEmpresaLocal, actor: ActorEmpresa) {
  const miembro = miembroActivo(estado, actor)
  asegurar(miembro?.rol === "principal", "Solo el responsable principal puede presentar la verificación de la empresa.")
  return miembro
}
function comprobarPermisos(actorMiembro: MiembroEmpresa, rol: unknown, permisos: unknown): PermisosEmpresa {
  asegurar(rol === "miembro" || rol === "administrador", "Selecciona un rol válido. El responsable principal no se asigna desde una invitación.")
  asegurar(rol !== "administrador" || actorMiembro.rol === "principal", "Solo el responsable principal puede designar administradores.")
  asegurar(permisos && typeof permisos === "object" && !Array.isArray(permisos), "Selecciona los permisos del miembro.")
  const entrada = permisos as Record<string, unknown>
  asegurar(Object.keys(entrada).every((clave) => CLAVES_PERMISOS.includes(clave as PermisoEmpresa)), "Hay permisos no reconocidos.")
  const salida = { ...PERMISOS_BASE }
  for (const clave of CLAVES_PERMISOS) {
    asegurar(typeof entrada[clave] === "boolean", "Debes indicar expresamente cada permiso.")
    asegurar(!entrada[clave] || actorMiembro.permisos[clave], "No puedes conceder permisos que no tienes.")
    salida[clave] = entrada[clave]
  }
  asegurar(!salida.gestionar_cobros || salida.ver_cobros, "Gestionar cobros requiere también el permiso para ver cobros.")
  return salida
}
function actividad(estado: EstadoEmpresaLocal, actor: ActorEmpresa, accion: string) {
  estado.actividad.unshift({ id: randomUUID(), actorNombre: actor.nombre, accion, fecha: new Date().toISOString() })
  estado.actividad = estado.actividad.slice(0, 150)
}
function caducarInvitaciones(estado: EstadoEmpresaLocal) {
  for (const invitacion of estado.invitaciones) if (invitacion.estado === "pendiente" && new Date(invitacion.expiraEn).getTime() <= Date.now()) invitacion.estado = "caducada"
}
function buscarInvitacion(estado: EstadoEmpresaLocal, token: string) {
  asegurar(typeof token === "string" && /^[a-f0-9]{64}$/.test(token), "La invitación no existe o el enlace no es válido.")
  const digest = Buffer.from(hashToken(token), "hex")
  const invitacion = estado.invitaciones.find((i) => {
    const guardado = Buffer.from(i.tokenHash, "hex")
    return guardado.length === digest.length && timingSafeEqual(guardado, digest)
  })
  asegurar(invitacion, "La invitación no existe o el enlace no es válido.")
  return invitacion
}

/** Almacén exclusivo de la prueba local. No consulta ni modifica servicios externos. */
export class EmpresaLocalStore {
  constructor(readonly directorio = (process.env.NODE_ENV !== "production" && process.env.DIIME_EMPRESAS_LOCAL_DIR?.trim()) || path.join(process.cwd(), "outputs", "empresas-local")) {}
  private get archivo() { return path.join(this.directorio, "state.json") }
  private async serializado<T>(operacion: () => Promise<T>): Promise<T> {
    const anterior = colas.get(this.archivo) ?? Promise.resolve()
    const actual = anterior.catch(() => undefined).then(operacion)
    colas.set(this.archivo, actual)
    try { return await actual } finally { if (colas.get(this.archivo) === actual) colas.delete(this.archivo) }
  }
  private async cargar(): Promise<EstadoEmpresaLocal> {
    try {
      const estado = JSON.parse(await readFile(this.archivo, "utf8")) as EstadoEmpresaLocal
      asegurar(estado.version === 1 && estado.empresa.id === "reformas-garcia", "El estado local no es compatible. Conserva una copia y reinicia la prueba.")
      // Upgrade existing local fixtures without resetting their legal/profile edits.
      estado.contratosPortfolio ??= crearDatosEmpresaIniciales().contratosPortfolio
      estado.proyectosPortfolio ??= portfolioInicial(estado)
      estado.imagenesEmpresa ??= []
      estado.revisionesPortfolio ??= []
      for (const proyecto of estado.proyectosPortfolio) {
        proyecto.revision_id ??= randomUUID()
        proyecto.presentado_en ??= proyecto.created_at
      }
      caducarInvitaciones(estado)
      return estado
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const estado = estadoInicial()
      await this.guardar(estado)
      return estado
    }
  }
  private async guardar(estado: EstadoEmpresaLocal) {
    await mkdir(this.directorio, { recursive: true, mode: 0o700 })
    const temporal = `${this.archivo}.${randomUUID()}.tmp`
    await writeFile(temporal, JSON.stringify(estado, null, 2), { mode: 0o600 })
    await rename(temporal, this.archivo)
  }
  private async operar<T>(actor: ActorEmpresa, mutacion: (estado: EstadoEmpresaLocal) => T | Promise<T>): Promise<ResultadoEmpresa<T>> {
    try {
      actorConocido(actor)
      return await this.serializado(async () => {
        const estado = await this.cargar()
        const data = await mutacion(estado)
        await this.guardar(estado)
        return { data }
      })
    } catch (error) {
      if (error instanceof ErrorEmpresa) return { error: error.message }
      console.error("[empresas-local] No se pudo completar la operación local.", error instanceof Error ? error.name : "Error")
      return { error: "No se pudo guardar el cambio local. Vuelve a intentarlo." }
    }
  }
  async publica(id: string): Promise<EmpresaPublica | null> {
    return this.serializado(async () => {
      const estado = await this.cargar()
      if (id !== estado.empresa.id && id !== estado.empresa.slug) return null
      return fichaPublica(estado)
    })
  }
  async portfolio(actor: ActorEmpresa): Promise<ResultadoEmpresa<ProyectoPortfolioLocal[]>> {
    return this.operar(actor, (estado) => {
      exigirPermiso(estado, actor, "perfil")
      return estado.proyectosPortfolio.filter((p) => p.empresa_id === estado.empresa.id)
    })
  }
  async trabajosCompletadosPortfolio(actor: ActorEmpresa) {
    return this.operar(actor, (estado) => {
      exigirPermiso(estado, actor, "perfil")
      return estado.contratosPortfolio.filter((t) => t.empresaId === estado.empresa.id && t.estado === "completado").map((t) => ({
        id: t.id, precio_acordado: t.precioAcordado, fecha_fin: t.fechaFin, oferta: { archivos: t.imagenes },
        solicitud: { titulo: t.titulo, descripcion: t.descripcion, ubicacion: t.ubicacion, categoria: { nombre: t.categoria } },
      }))
    })
  }
  async guardarProyectoPortfolio(actor: ActorEmpresa, input: InputPortfolioEmpresaLocal, itemId: string | null = null): Promise<ResultadoEmpresa<{ id: string }>> {
    return this.operar(actor, (estado) => {
      exigirPermiso(estado, actor, "perfil")
      const anterior = itemId === null ? null : estado.proyectosPortfolio.find((p) => p.id === itemId && p.empresa_id === estado.empresa.id)
      asegurar(itemId === null || anterior, "Ese proyecto no está disponible para tu empresa.")
      const trabajoId = texto(input.trabajo_id || "", "Trabajo", 0, 100)
      const contrato = trabajoId ? estado.contratosPortfolio.find((t) => t.id === trabajoId && t.empresaId === estado.empresa.id && t.estado === "completado") : null
      asegurar(!trabajoId || contrato, "Ese trabajo no está disponible para el portfolio.")
      const evidencia = texto(input.evidencia_acreditacion || "", "Evidencias", contrato ? 0 : 20, 4000)
      const imagen = texto(input.imagen_url, "Imagen", 0, 2048)
      asegurar(!imagen || /^https:\/\/[^\s@]+$/.test(imagen) || /^\/images\/empresas-local\/[\w.-]+\.svg$/.test(imagen) || esImagenGuardadaLocal(estado, imagen), "La imagen debe estar alojada mediante https://.")
      const fecha = texto(input.fecha_completado, "Fecha", 0, 10)
      asegurar(!fecha || (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isFinite(Date.parse(fecha)) && new Date(fecha).toISOString().slice(0, 10) === fecha), "Revisa los datos del proyecto.")
      const presupuesto = input.presupuesto ?? null
      asegurar(presupuesto === null || (typeof presupuesto === "number" && Number.isFinite(presupuesto) && presupuesto >= 0 && presupuesto <= 99999999.99), "Indica un presupuesto válido.")
      const proyecto: ProyectoPortfolioLocal = {
        id: anterior?.id || randomUUID(), empresa_id: estado.empresa.id, trabajo_id: contrato?.id || null,
        titulo: contrato?.titulo || texto(input.titulo, "Título", 1, 500), descripcion: contrato?.descripcion || texto(input.descripcion, "Descripción", 1, 20000),
        categoria: contrato?.categoria || texto(input.categoria, "Categoría", 0, 200), ubicacion: contrato?.ubicacion || texto(input.ubicacion || "", "Ubicación", 0, 500),
        imagenes: imagen ? [imagen] : [], duracion: texto(input.duracion || "", "Duración", 0, 200), fecha_proyecto: fecha,
        presupuesto, contexto_proveedor: texto(input.contexto_proveedor || "", "Contexto", 0, 20000),
        participantes_ids: contrato?.participantesIds || [actor.id], created_at: anterior?.created_at || new Date().toISOString(),
        evidencia_acreditacion: evidencia, acreditacion: contrato ? "diime" : "pendiente", nota_acreditacion: null,
        revision_id: randomUUID(), presentado_en: new Date().toISOString(),
      }
      // External edits always return to review; clients cannot pass an approval.
      estado.proyectosPortfolio = [proyecto, ...estado.proyectosPortfolio.filter((p) => p.id !== proyecto.id)]
      actividad(estado, actor, contrato ? "Añadió al portfolio un trabajo completado en Diime." : "Envió un proyecto externo del portfolio a revisión.")
      return { id: proyecto.id }
    })
  }
  async eliminarProyectoPortfolio(actor: ActorEmpresa, itemId: string): Promise<ResultadoEmpresa<{ success: true }>> {
    return this.operar(actor, (estado) => {
      exigirPermiso(estado, actor, "perfil")
      asegurar(estado.proyectosPortfolio.some((p) => p.id === itemId && p.empresa_id === estado.empresa.id), "Ese proyecto no está disponible para tu empresa.")
      estado.proyectosPortfolio = estado.proyectosPortfolio.filter((p) => p.id !== itemId)
      actividad(estado, actor, "Eliminó un proyecto del portfolio.")
      return { success: true as const }
    })
  }
  async acreditacionesPortfolio(actor: ActorEmpresa) {
    return this.operar(actor, (estado) => {
      asegurar(actor.plataformaAdmin, "Solo el equipo de Diime puede revisar proyectos.")
      return estado.proyectosPortfolio.filter((p) => !p.trabajo_id && p.empresa_id === estado.empresa.id).map((p) => ({
        tipo: "empresa" as const, item_id: p.id, revision_id: p.revision_id,
        estado: p.acreditacion === "diime" ? "pendiente" as const : p.acreditacion,
        titulo: p.titulo, descripcion: p.descripcion, imagenes: p.imagenes, evidencia_acreditacion: p.evidencia_acreditacion,
        contexto_proveedor: p.contexto_proveedor, proveedor: estado.empresa.nombre, proveedor_id: p.empresa_id,
        presentado_en: p.presentado_en, nota: p.nota_acreditacion,
      }))
    })
  }
  async revisarAcreditacionPortfolio(actor: ActorEmpresa, input: InputRevisionPortfolioLocal): Promise<ResultadoEmpresa<{ success: true }>> {
    return this.operar(actor, (estado) => {
      asegurar(actor.plataformaAdmin, "Solo el equipo de Diime puede revisar proyectos.")
      asegurar(input && ["acreditado", "requiere_informacion"].includes(input.decision) && typeof input.nota === "string"
        && input.nota.trim().length >= 10 && input.nota.trim().length <= 2000,
      "Indica una decisión y el motivo de la revisión (10–2.000 caracteres).")
      const proyecto = estado.proyectosPortfolio.find((p) => input.tipo === "empresa" && p.id === input.itemId && p.empresa_id === estado.empresa.id)
      asegurar(proyecto && !proyecto.trabajo_id, "Este proyecto no está disponible para revisión.")
      asegurar(!estado.miembros.some((m) => m.usuarioId === actor.id), "No puedes acreditar tus propios proyectos ni los de tu empresa.")
      asegurar(proyecto.revision_id === input.revisionId, "El proyecto ha cambiado. Recarga antes de revisar.")
      asegurar(input.decision !== "acreditado" || proyecto.evidencia_acreditacion.trim().length >= 20, "Faltan referencias o evidencias para acreditar este proyecto.")
      const nota = texto(input.nota, "Nota", 10, 2000)
      proyecto.acreditacion = input.decision
      proyecto.nota_acreditacion = nota
      estado.revisionesPortfolio.push({ itemId: proyecto.id, revisionId: proyecto.revision_id, decision: input.decision, nota, revisadoPor: actor.id, fecha: new Date().toISOString() })
      actividad(estado, actor, input.decision === "acreditado" ? "Acreditó un proyecto externo del portfolio." : "Solicitó información sobre un proyecto del portfolio.")
      return { success: true as const }
    })
  }
  async guardarImagen(actor: ActorEmpresa, empresaId: string, bytes: Uint8Array, tipo: string): Promise<ResultadoEmpresa<{ url: string }>> {
    return this.operar(actor, async (estado) => {
      exigirPermiso(estado, actor, "perfil")
      asegurar(empresaId === estado.empresa.id, "La empresa activa ha cambiado. Recarga la página antes de guardar.")
      asegurar(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= 3 * 1024 * 1024, "El logo no puede superar los 3 MB.")
      asegurar(["image/png", "image/jpeg", "image/webp"].includes(tipo) && imagenLocalValida(bytes, tipo as ImagenEmpresaLocal["tipo"]), "El archivo no coincide con una imagen PNG, JPEG o WebP válida.")
      const id = randomUUID()
      await mkdir(path.join(this.directorio, "imagenes"), { recursive: true, mode: 0o700 })
      await writeFile(path.join(this.directorio, "imagenes", id), bytes, { mode: 0o600, flag: "wx" })
      estado.imagenesEmpresa.push({ id, empresaId, tipo: tipo as ImagenEmpresaLocal["tipo"] })
      return { url: `/api/empresas/imagen-local/${id}` }
    })
  }
  async imagen(id: string): Promise<{ contenido: Uint8Array; tipo: string } | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null
    return this.serializado(async () => {
      const estado = await this.cargar()
      const imagen = estado.imagenesEmpresa.find((i) => i.id === id && i.empresaId === estado.empresa.id)
      if (!imagen) return null
      return { contenido: await readFile(path.join(this.directorio, "imagenes", id)), tipo: imagen.tipo }
    })
  }
  async empleado(usuarioId: string): Promise<{ perfil: MiembroEmpresaPublico; empresa: EmpresaPublica } | null> {
    return this.serializado(async () => {
      const estado = await this.cargar()
      const miembro = estado.miembros.find((m) => m.usuarioId === usuarioId && m.perfilPublico)
      return miembro ? { perfil: miembroPublico(miembro), empresa: fichaPublica(estado) } : null
    })
  }
  async espacio(actor: ActorEmpresa): Promise<ResultadoEmpresa<EspacioEmpresa>> {
    return this.operar(actor, (estado) => {
      const miembro = miembroActivo(estado, actor)
      asegurar(miembro || actor.plataformaAdmin, "Tu cuenta no tiene acceso activo a esta empresa. Si has recibido una invitación, abre su enlace para aceptarla.")
      const gestionaEquipo = !!miembro?.permisos.equipo || actor.plataformaAdmin
      const principal = miembro?.rol === "principal"
      const empresa = { ...estado.empresa }
      if (!principal && !actor.plataformaAdmin) { empresa.representanteNombre = ""; empresa.cargoLegal = "" }
      return {
        empresa, miembros: gestionaEquipo ? estado.miembros : estado.miembros.filter((m) => m.usuarioId === actor.id),
        invitaciones: gestionaEquipo ? estado.invitaciones.map(invitacionPublica) : [], verificacion: principal || actor.plataformaAdmin ? estado.verificacion : null,
        actividad: gestionaEquipo ? estado.actividad : [],
        solicitudes: miembro?.permisos.encargos ? estado.solicitudes : miembro?.permisos.mensajes ? estado.solicitudes.filter((s) => s.responsableUsuarioId === actor.id) : [],
        actor, miembroActual: miembro, local: true,
      }
    })
  }
  async invitacion(actor: ActorEmpresa, token: string): Promise<ResultadoEmpresa<{ invitacion: InvitacionEmpresa; empresaNombre: string; coincideEmail: boolean }>> {
    return this.operar(actor, (estado) => {
      const invitacion = buscarInvitacion(estado, token)
      asegurar(invitacion.email === actor.email, "Accede con la cuenta del correo al que se dirigió la invitación para consultar sus detalles.")
      return { invitacion: invitacionPublica(invitacion), empresaNombre: estado.empresa.nombre, coincideEmail: true }
    })
  }
  async guardarPerfil(actor: ActorEmpresa, input: InputPerfilEmpresa): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      exigirPermiso(estado, actor, "perfil")
      const profesionales = validarDatosProfesionalesEmpresa(input)
      asegurar(!profesionales.error, profesionales.error || "")
      asegurar(input.domicilio === undefined || input.domicilio.trim() === (estado.empresa.domicilio || ""), "Edita y comprueba el domicilio desde Datos legales.")
      const nombre = texto(input.nombre, "Nombre comercial", profesionales.data ? 1 : 3, profesionales.data ? 160 : 100)
      const descripcion = texto(input.descripcion, "Descripción", profesionales.data ? 0 : 30, profesionales.data ? 6000 : 1500)
      const preferencias = validarPreferenciasEmpresa(input)
      asegurar(!preferencias.error, preferencias.error || "")
      for (const imagen of [input.logoUrl, input.portadaUrl]) {
        if (imagen) {
          if (imagen === "/kitchen-renovation-open-concept.jpg" || esImagenGuardadaLocal(estado, imagen)) continue
          let url: URL
          try { url = new URL(imagen) } catch { throw new ErrorEmpresa("La imagen debe estar alojada mediante https://.") }
          asegurar(url.protocol === "https:" && !url.username && !url.password, "La imagen debe estar alojada mediante https://.")
        }
      }
      const cobertura = validarCoberturaEmpresa(input)
      asegurar(!cobertura.error, cobertura.error || "")
      const ubicacion = profesionales.data ? texto(input.ubicacion, "Ubicación", 0, 200) : cobertura.data ? cobertura.data.provincias.join(", ") : texto(input.ubicacion, "Ubicación", 3, 120)
      const web = texto(input.web, "Web corporativa", 0, 300)
      if (web) {
        let url: URL
        try { url = new URL(web) } catch { throw new ErrorEmpresa("Introduce una web válida que empiece por https://.") }
        asegurar(url.protocol === "https:" && !url.username && !url.password, "La web corporativa debe usar https://.")
      }
      asegurar(Array.isArray(input.servicios) && input.servicios.length >= 1 && input.servicios.length <= CATEGORIAS_SERVICIO_NOMBRES.length, "Selecciona al menos un servicio válido de la lista.")
      const servicios = cobertura.data?.servicios || [...new Set(input.servicios.map((s) => texto(s, "Servicio", 2, 80)))]
      Object.assign(estado.empresa, { nombre, descripcion, ubicacion, web, servicios, ...(profesionales.data || {}), ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}), ...(input.portadaUrl !== undefined ? { portadaUrl: input.portadaUrl } : {}), ...(preferencias.data || {}), ...(cobertura.data ? { provincias: cobertura.data.provincias } : {}) })
      actividad(estado, actor, "Actualizó el perfil público de la empresa.")
    })
  }
  async guardarDatosLegales(actor: ActorEmpresa, input: { razonSocial: string; cif: string; domicilio: string; anteriores: { razonSocial: string; cif: string; domicilio: string }; comprobada: { id: string; domicilio: string; comprobadoEn: string } | null }): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      const miembro = exigirPermiso(estado, actor, "perfil")
      const identidadModificada = input.razonSocial !== estado.empresa.razonSocial || input.cif !== estado.empresa.nif
      asegurar(!identidadModificada || miembro.rol === "principal", "Solo el responsable principal puede modificar la razón social o el CIF.")
      asegurar(input.anteriores.razonSocial === estado.empresa.razonSocial && input.anteriores.cif === estado.empresa.nif && input.anteriores.domicilio === (estado.empresa.domicilio || ""), "Los datos han cambiado. Recarga la página antes de guardar.")
      asegurar(input.razonSocial.trim().length >= 2 && input.razonSocial.length <= 160 && /^[A-Z]\d{7}[A-Z0-9]$/.test(input.cif), "Revisa la razón social y el CIF.")
      const cambiaDireccion = input.domicilio !== (estado.empresa.domicilio || "")
      asegurar(!cambiaDireccion || !input.domicilio || input.comprobada?.domicilio === input.domicilio, "Busca y selecciona la dirección antes de guardar.")
      Object.assign(estado.empresa, { razonSocial: input.razonSocial, nif: input.cif, domicilio: input.domicilio })
      if (cambiaDireccion || input.comprobada) estado.empresa.domicilioComprobadoEn = input.comprobada?.comprobadoEn
      if (identidadModificada) {
        estado.empresa.estadoVerificacion = "requiere_informacion"
        if (estado.verificacion) { estado.verificacion.estado = "requiere_informacion"; estado.verificacion.notaRevision = "La identidad de la empresa ha cambiado. Presenta documentación actualizada." }
      }
      actividad(estado, actor, identidadModificada ? "Actualizó la identidad legal; requiere nueva verificación." : "Actualizó el domicilio de la empresa.")
    })
  }
  async invitar(actor: ActorEmpresa, input: InputMiembro): Promise<ResultadoEmpresa<{ url: string }>> {
    return this.operar(actor, (estado) => {
      const quienInvita = exigirPermiso(estado, actor, "equipo")
      asegurar(estado.empresa.estadoVerificacion === "verificada", "Completa la verificación de la empresa antes de invitar al equipo.")
      const permisos = comprobarPermisos(quienInvita, input.rol, input.permisos)
      const email = texto(input.email, "Correo", 5, 180).toLowerCase()
      // La demostración no incorpora identidades ni direcciones reales.
      asegurar(email === ACTORES_EMPRESA_LOCAL.invitado.email, "En esta prueba local invita a elena@empresa.example, la cuenta ficticia disponible.")
      const nombre = texto(input.nombre, "Nombre", 2, 100)
      asegurar(!estado.miembros.some((m) => m.email === email && m.estado === "activo"), "Esta persona ya forma parte del equipo.")
      asegurar(!estado.invitaciones.some((i) => i.email === email && i.estado === "pendiente"), "Ya hay una invitación pendiente para este correo.")
      const token = randomBytes(32).toString("hex")
      const creadaEn = Date.now()
      estado.invitaciones.push({ id: randomUUID(), empresaId: estado.empresa.id, nombre, email, rol: input.rol, permisos, estado: "pendiente", expiraEn: new Date(creadaEn + 7 * 86400000).toISOString(), creadaEn: new Date(creadaEn).toISOString(), creadaPor: actor.id, tokenHash: hashToken(token) })
      actividad(estado, actor, `Creó una invitación local para ${nombre}. No se envió ningún correo.`)
      return { url: `/mi-empresa/invitaciones/${token}` }
    })
  }
  async actualizarMiembro(actor: ActorEmpresa, input: InputActualizarMiembro): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      const gestor = exigirPermiso(estado, actor, "equipo")
      const objetivo = estado.miembros.find((m) => m.id === input.miembroId && m.estado === "activo")
      asegurar(objetivo, "El miembro no tiene acceso activo.")
      asegurar(objetivo.rol !== "principal", "El responsable principal está protegido. Su sustitución requiere una nueva acreditación.")
      asegurar(objetivo.usuarioId !== actor.id, "No puedes modificar tus propios permisos.")
      asegurar(gestor.rol === "principal" || objetivo.rol === "miembro", "Solo el responsable principal puede modificar a otro administrador.")
      const permisos = comprobarPermisos(gestor, input.rol, input.permisos)
      Object.assign(objetivo, { rol: input.rol, permisos })
      if (!permisos.mensajes) this.reasignarSolicitudes(estado, objetivo.usuarioId)
      actividad(estado, actor, `Actualizó el rol y los permisos de ${objetivo.nombre}.`)
    })
  }
  private reasignarSolicitudes(estado: EstadoEmpresaLocal, usuarioId: string) {
    const principal = estado.miembros.find((m) => m.rol === "principal" && m.estado === "activo" && m.usuarioId !== usuarioId)
    for (const solicitud of estado.solicitudes) if (solicitud.responsableUsuarioId === usuarioId) solicitud.responsableUsuarioId = principal?.usuarioId ?? null
  }
  async revocarMiembro(actor: ActorEmpresa, miembroId: string): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      const gestor = exigirPermiso(estado, actor, "equipo")
      const objetivo = estado.miembros.find((m) => m.id === miembroId && m.estado === "activo")
      asegurar(objetivo, "El miembro no tiene acceso activo.")
      asegurar(objetivo.rol !== "principal", "El responsable principal está protegido. Su sustitución requiere una nueva acreditación.")
      asegurar(objetivo.usuarioId !== actor.id, "No puedes revocar tu propio acceso desde aquí.")
      asegurar(gestor.rol === "principal" || objetivo.rol === "miembro", "Solo el responsable principal puede revocar a otro administrador.")
      objetivo.estado = "revocado"
      objetivo.permisos = Object.fromEntries(CLAVES_PERMISOS.map((clave) => [clave, false])) as PermisosEmpresa
      // También se invalidan delegaciones que aún no se han aceptado.
      for (const invitacion of estado.invitaciones) if (invitacion.creadaPor === objetivo.usuarioId && invitacion.estado === "pendiente") invitacion.estado = "revocada"
      this.reasignarSolicitudes(estado, objetivo.usuarioId)
      actividad(estado, actor, `Revocó el acceso de ${objetivo.nombre}. Sus solicitudes pasan al responsable principal; el historial de trabajos se conserva.`)
    })
  }
  async cancelarInvitacion(actor: ActorEmpresa, id: string): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      const gestor = exigirPermiso(estado, actor, "equipo")
      const invitacion = estado.invitaciones.find((i) => i.id === id && i.estado === "pendiente")
      asegurar(invitacion, "Esta invitación ya no está pendiente.")
      asegurar(gestor.rol === "principal" || invitacion.rol === "miembro", "Solo el responsable principal puede cancelar la invitación de un administrador.")
      invitacion.estado = "revocada"
      actividad(estado, actor, `Canceló la invitación de ${invitacion.nombre}.`)
    })
  }
  async aceptarInvitacion(actor: ActorEmpresa, token: string): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      const invitacion = buscarInvitacion(estado, token)
      asegurar(estado.empresa.estadoVerificacion === "verificada", "La empresa debe completar su verificación antes de incorporar nuevos miembros.")
      asegurar(invitacion.estado === "pendiente", invitacion.estado === "caducada" ? "La invitación ha caducado. Pide una nueva al administrador." : "Esta invitación ya se ha utilizado o ha sido revocada.")
      asegurar(actor.email === invitacion.email, "Accede con la cuenta del correo al que se dirigió la invitación.")
      asegurar(!miembroActivo(estado, actor), "Ya formas parte de esta empresa.")
      const emisor = estado.miembros.find((m) => m.usuarioId === invitacion.creadaPor && m.estado === "activo")
      asegurar(emisor?.permisos.equipo, "La persona que te invitó ya no puede gestionar el equipo. Pide una nueva invitación.")
      const permisos = comprobarPermisos(emisor, invitacion.rol, invitacion.permisos)
      const existente = estado.miembros.find((m) => m.usuarioId === actor.id)
      if (existente) Object.assign(existente, { estado: "activo", permisos, rol: invitacion.rol })
      else estado.miembros.push({ id: randomUUID(), usuarioId: actor.id, nombre: actor.nombre, email: actor.email, cargo: "Miembro del equipo", rol: invitacion.rol, estado: "activo", permisos, perfilPublico: false, bio: "", habilidades: [] })
      invitacion.estado = "aceptada"
      actividad(estado, actor, "Aceptó su invitación y se incorporó al equipo autorizado.")
    })
  }
  async solicitarVerificacion(actor: ActorEmpresa, input: InputVerificacion): Promise<ResultadoEmpresa> {
    return this.operar(actor, async (estado) => {
      exigirPrincipal(estado, actor)
      asegurar(estado.empresa.estadoVerificacion !== "en_revision", "La documentación ya está en revisión.")
      asegurar(input.metodo === "certificado" || input.metodo === "documental", "Selecciona un método de acreditación válido.")
      asegurar(input.consentimiento === true, "Confirma la autorización para representar a la empresa.")
      const representanteNombre = texto(input.representanteNombre, "Representante", 3, 100)
      const cargoLegal = texto(input.cargoLegal, "Cargo legal", 3, 100)
      asegurar(representanteNombre === ACTORES_EMPRESA_LOCAL.owner.nombre, "Utiliza Javier García, el representante ficticio de esta prueba local.")
      asegurar(input.documento instanceof Uint8Array && input.documento.byteLength > 5 && input.documento.byteLength <= 5 * 1024 * 1024, "Adjunta un PDF de hasta 5 MB.")
      asegurar(Buffer.from(input.documento.subarray(0, 5)).toString("ascii") === "%PDF-", "El archivo debe ser un documento PDF válido.")
      const documentoNombre = path.basename(texto(input.documentoNombre, "Documento", 5, 180))
      asegurar(documentoNombre.toLowerCase().endsWith(".pdf"), "El documento debe tener extensión .pdf.")
      const id = randomUUID()
      const carpeta = path.join(this.directorio, "documentos")
      await mkdir(carpeta, { recursive: true, mode: 0o700 })
      const archivo = `${id}.pdf`
      await writeFile(path.join(carpeta, archivo), input.documento, { mode: 0o600 })
      estado.documentos.push({ id, archivo, sha256: createHash("sha256").update(input.documento).digest("hex") })
      estado.verificacion = { id, estado: "en_revision", metodo: input.metodo, representanteNombre, cargoLegal, responsableUsuarioId: actor.id, documentoNombre, creadaEn: new Date().toISOString() }
      estado.empresa.estadoVerificacion = "en_revision"
      estado.empresa.representanteNombre = representanteNombre
      estado.empresa.cargoLegal = cargoLegal
      actividad(estado, actor, "Presentó documentación para revisión local. Subir el PDF no verifica la empresa.")
    })
  }
  async documentoVerificacion(actor: ActorEmpresa): Promise<ResultadoEmpresa<{ contenido: Uint8Array; nombre: string }>> {
    return this.operar(actor, async (estado) => {
      const miembro = miembroActivo(estado, actor)
      asegurar(actor.plataformaAdmin || miembro?.rol === "principal", "Solo el responsable principal y el equipo Diime pueden consultar esta documentación.")
      const solicitud = estado.verificacion
      asegurar(solicitud, "Todavía no se ha presentado documentación.")
      const documento = estado.documentos.find((d) => d.id === solicitud.id)
      asegurar(documento && /^[a-f0-9-]{36}\.pdf$/.test(documento.archivo), "El documento privado no está disponible.")
      return { contenido: new Uint8Array(await readFile(path.join(this.directorio, "documentos", documento.archivo))), nombre: solicitud.documentoNombre }
    })
  }
  async revisarVerificacion(actor: ActorEmpresa, input: { decision: "verificada" | "requiere_informacion"; nota: string; verificacionId?: string }): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      asegurar(actor.plataformaAdmin, "La revisión corresponde al equipo Diime; el representante no puede aprobar su propia solicitud.")
      asegurar(estado.verificacion?.estado === "en_revision", "No hay una solicitud pendiente de revisión.")
      asegurar(input.verificacionId === estado.verificacion.id, "La solicitud ha cambiado. Actualiza la lista y revisa el expediente vigente")
      asegurar(input.decision === "verificada" || input.decision === "requiere_informacion", "La decisión no es válida.")
      const nota = texto(input.nota, "Nota de revisión", 8, 1000)
      Object.assign(estado.verificacion, { estado: input.decision, notaRevision: nota, revisadaEn: new Date().toISOString() })
      estado.empresa.estadoVerificacion = input.decision
      actividad(estado, actor, input.decision === "verificada" ? "Aprobó la verificación en esta simulación local." : "Solicitó información adicional para acreditar la representación.")
    })
  }
  async solicitarPresupuesto(actor: ActorEmpresa, input: { empresaId: string; titulo: string; descripcion: string }): Promise<ResultadoEmpresa<{ id: string }>> {
    return this.operar(actor, (estado) => {
      asegurar(actor.id === "cliente" && !miembroActivo(estado, actor), "Cambia a la vista de cliente para solicitar un presupuesto a la empresa.")
      asegurar(input.empresaId === estado.empresa.id, "La empresa no está disponible.")
      asegurar(estado.empresa.estadoVerificacion === "verificada", "Esta empresa debe completar su verificación antes de recibir nuevas solicitudes.")
      const titulo = texto(input.titulo, "Título", 8, 140)
      const descripcion = texto(input.descripcion, "Descripción", 20, 2000)
      const responsable = estado.miembros.find((m) => m.usuarioId === "ana" && m.estado === "activo" && m.permisos.mensajes) ?? estado.miembros.find((m) => m.rol === "principal" && m.estado === "activo")
      const id = randomUUID()
      estado.solicitudes.unshift({ id, empresaId: estado.empresa.id, empresaRazonSocial: estado.empresa.razonSocial, clienteUsuarioId: actor.id, clienteNombre: actor.nombre, titulo, descripcion, responsableUsuarioId: responsable?.usuarioId ?? null, creadaEn: new Date().toISOString() })
      actividad(estado, actor, `Solicitó un presupuesto a ${estado.empresa.razonSocial}. Le atiende ${responsable?.nombre ?? "el equipo"}.`)
      return { id }
    })
  }
}

export const empresaLocalStore = new EmpresaLocalStore()
