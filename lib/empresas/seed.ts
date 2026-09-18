import type { ActorEmpresa, EmpresaFicha, MiembroEmpresa, PermisosEmpresa, ResenaEmpresa, TrabajoEmpresa } from "./types"

export const ACTORES_EMPRESA_LOCAL: Record<string, ActorEmpresa> = {
  owner: { id: "owner", nombre: "Javier García", email: "javier@empresa.example", plataformaAdmin: false },
  ana: { id: "ana", nombre: "Ana López", email: "ana@empresa.example", plataformaAdmin: false },
  mario: { id: "mario", nombre: "Mario Ruiz", email: "mario@empresa.example", plataformaAdmin: false },
  cliente: { id: "cliente", nombre: "Lucía Martín", email: "lucia@cliente.example", plataformaAdmin: false },
  admin: { id: "admin", nombre: "Equipo Diime", email: "revision@diime.example", plataformaAdmin: true },
  invitado: { id: "invitado", nombre: "Elena Torres", email: "elena@empresa.example", plataformaAdmin: false },
}

export const TODOS_PERMISOS: PermisosEmpresa = { perfil: true, mensajes: true, presupuestos: true, encargos: true, equipo: true, ver_cobros: true, gestionar_cobros: true }
export const PERMISOS_BASE: PermisosEmpresa = { perfil: false, mensajes: true, presupuestos: false, encargos: false, equipo: false, ver_cobros: false, gestionar_cobros: false }

export function crearDatosEmpresaIniciales() {
  const empresa: EmpresaFicha = {
    id: "reformas-garcia", slug: "reformas-garcia", nombre: "Reformas García", razonSocial: "Reformas García, S. L.", nif: "B00000000",
    descripcion: "Reformas de viviendas y locales con un equipo cercano, una planificación clara y atención a cada detalle. Coordinamos albañilería, fontanería, electricidad y acabados para que tengas un único interlocutor de principio a fin.",
    web: "https://reformas-garcia.example", ubicacion: "Madrid y alrededores", servicios: ["Reformas integrales", "Cocinas y baños", "Pintura", "Fontanería"],
    estadoVerificacion: "verificada", representanteNombre: "Javier García", cargoLegal: "Administrador único",
  }
  const miembros: MiembroEmpresa[] = [
    { id: "miembro-owner", usuarioId: "owner", nombre: "Javier García", email: "javier@empresa.example", cargo: "Dirección y coordinación", rol: "principal", estado: "activo", permisos: { ...TODOS_PERMISOS }, perfilPublico: true, bio: "Coordino cada reforma y acompaño al cliente desde la primera visita hasta la entrega.", habilidades: ["Planificación", "Reformas integrales", "Coordinación de equipo"] },
    { id: "miembro-ana", usuarioId: "ana", nombre: "Ana López", email: "ana@empresa.example", cargo: "Responsable de proyectos", rol: "administrador", estado: "activo", permisos: { ...TODOS_PERMISOS, ver_cobros: false, gestionar_cobros: false }, perfilPublico: true, bio: "Soy tu persona de contacto para definir el proyecto, preparar el presupuesto y resolver las dudas durante la obra.", habilidades: ["Diseño de espacios", "Presupuestos", "Atención al cliente"] },
    { id: "miembro-mario", usuarioId: "mario", nombre: "Mario Ruiz", email: "mario@empresa.example", cargo: "Especialista en reformas", rol: "miembro", estado: "activo", permisos: { ...PERMISOS_BASE }, perfilPublico: true, bio: "Trabajo en la ejecución de reformas y en los acabados, con especial atención a cocinas y baños.", habilidades: ["Albañilería", "Alicatado", "Acabados"] },
  ]
  const trabajos: TrabajoEmpresa[] = [
    { id: "trabajo-cocina", empresaId: empresa.id, titulo: "Una cocina abierta para compartir", descripcion: "Reforma completa de cocina, renovación de instalaciones y apertura al salón. Un espacio más luminoso y práctico para el día a día.", categoria: "Cocinas y baños", ubicacion: "Chamberí, Madrid", rangoPrecio: "10.000–15.000 €", fecha: "2026-08-20", participantesIds: ["ana", "mario"], imagen: "/images/empresas-local/cocina.svg" },
    { id: "trabajo-bano", empresaId: empresa.id, titulo: "Un baño cómodo y sin barreras", descripcion: "Sustitución de bañera por ducha, renovación de revestimientos e iluminación y mejora del aprovechamiento del espacio.", categoria: "Cocinas y baños", ubicacion: "Retiro, Madrid", rangoPrecio: "5.000–8.000 €", fecha: "2026-07-12", participantesIds: ["mario"], imagen: "/images/empresas-local/bano.svg" },
    { id: "trabajo-vivienda", empresaId: empresa.id, titulo: "Nueva vida para una vivienda familiar", descripcion: "Redistribución de espacios, pintura y renovación de suelos, con coordinación de todos los oficios por nuestro equipo.", categoria: "Reformas integrales", ubicacion: "Alcobendas, Madrid", rangoPrecio: "25.000–40.000 €", fecha: "2026-06-05", participantesIds: ["owner", "ana", "mario"], imagen: "/images/empresas-local/salon.svg" },
  ]
  const resenas: ResenaEmpresa[] = [
    { id: "resena-1", trabajoId: "trabajo-cocina", autor: "Laura M.", puntuacion: 5, comentario: "Nos explicaron cada fase y Ana estuvo siempre pendiente. La cocina ha quedado justo como la imaginábamos.", fecha: "2026-08-24" },
    { id: "resena-2", trabajoId: "trabajo-bano", autor: "Carlos R.", puntuacion: 5, comentario: "Un equipo puntual y cuidadoso. Mario resolvió muy bien los detalles del baño y dejaron todo limpio.", fecha: "2026-07-16" },
    { id: "resena-3", trabajoId: "trabajo-vivienda", autor: "Beatriz S.", puntuacion: 4, comentario: "Buena coordinación y comunicación durante toda la reforma. Hubo un ajuste de plazos que nos avisaron con tiempo.", fecha: "2026-06-10" },
  ]
  return { empresa, miembros, trabajos, resenas }
}
