import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { ACTORES_EMPRESA_LOCAL, crearDatosEmpresaIniciales, PERMISOS_BASE } from "./seed"
import type { ActorEmpresa, ActividadEmpresa, EmpresaPublica, EspacioEmpresa, InvitacionEmpresa, MiembroEmpresa, MiembroEmpresaPublico, PermisoEmpresa, PermisosEmpresa, ResultadoEmpresa, RolEmpresa, SolicitudPresupuestoEmpresa, SolicitudVerificacionEmpresa } from "./types"

interface InvitacionPrivada extends InvitacionEmpresa { tokenHash: string; creadaPor: string }
interface DocumentoPrivado { id: string; archivo: string; sha256: string }
export interface EstadoEmpresaLocal extends ReturnType<typeof crearDatosEmpresaIniciales> {
  version: 1
  invitaciones: InvitacionPrivada[]
  verificacion: SolicitudVerificacionEmpresa | null
  documentos: DocumentoPrivado[]
  actividad: ActividadEmpresa[]
  solicitudes: SolicitudPresupuestoEmpresa[]
}

export type InputMiembro = { nombre: string; email: string; rol: Exclude<RolEmpresa, "principal">; permisos: PermisosEmpresa }
export type InputActualizarMiembro = { miembroId: string; rol: Exclude<RolEmpresa, "principal">; permisos: PermisosEmpresa }
export type InputPerfilEmpresa = { nombre: string; descripcion: string; web: string; ubicacion: string; servicios: string[] }
export type InputVerificacion = { metodo: "certificado" | "documental"; representanteNombre: string; cargoLegal: string; documentoNombre: string; documento: Uint8Array; consentimiento: boolean }

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
  const { nif: _nif, representanteNombre: _representante, cargoLegal: _cargo, ...empresa } = estado.empresa
  return { empresa, miembros: estado.miembros.filter((m) => m.estado === "activo" && m.perfilPublico).map(miembroPublico), trabajos: estado.trabajos, resenas: estado.resenas, local: true }
}
function estadoInicial(): EstadoEmpresaLocal {
  return { version: 1, ...crearDatosEmpresaIniciales(), invitaciones: [], verificacion: null, documentos: [], solicitudes: [], actividad: [{ id: "actividad-inicial", actorNombre: "Equipo Diime", accion: "Empresa de ejemplo preparada para la prueba local. La verificación inicial es ficticia.", fecha: "2026-09-17T08:00:00.000Z" }] }
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
  constructor(readonly directorio = path.join(process.cwd(), "outputs", "empresas-local")) {}
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
      if (!principal && !actor.plataformaAdmin) { empresa.nif = ""; empresa.representanteNombre = ""; empresa.cargoLegal = "" }
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
      const nombre = texto(input.nombre, "Nombre comercial", 3, 100)
      const descripcion = texto(input.descripcion, "Descripción", 30, 1500)
      const ubicacion = texto(input.ubicacion, "Ubicación", 3, 120)
      const web = texto(input.web, "Web corporativa", 0, 300)
      if (web) {
        let url: URL
        try { url = new URL(web) } catch { throw new ErrorEmpresa("Introduce una web válida que empiece por https://.") }
        asegurar(url.protocol === "https:" && !url.username && !url.password, "La web corporativa debe usar https://.")
      }
      asegurar(Array.isArray(input.servicios) && input.servicios.length >= 1 && input.servicios.length <= 12, "Selecciona entre 1 y 12 servicios.")
      const servicios = [...new Set(input.servicios.map((s) => texto(s, "Servicio", 2, 80)))]
      Object.assign(estado.empresa, { nombre, descripcion, ubicacion, web, servicios })
      actividad(estado, actor, "Actualizó el perfil público de la empresa.")
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
  async revisarVerificacion(actor: ActorEmpresa, input: { decision: "verificada" | "requiere_informacion"; nota: string }): Promise<ResultadoEmpresa> {
    return this.operar(actor, (estado) => {
      asegurar(actor.plataformaAdmin, "La revisión corresponde al equipo Diime; el representante no puede aprobar su propia solicitud.")
      asegurar(estado.verificacion?.estado === "en_revision", "No hay una solicitud pendiente de revisión.")
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
