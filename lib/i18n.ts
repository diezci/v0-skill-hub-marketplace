// Shared, deterministic translations. No browser globals or user-content rewriting.
import { EN_AVISOS } from "./traducciones/avisos"
import { EN_ADMIN_PAGOS } from "./traducciones/admin-pagos"
import { EN_COBROS } from "./traducciones/cobros"
import { EN_REEMBOLSOS } from "./traducciones/reembolsos"
import { EN_ACTIVIDAD } from "./traducciones/actividad"
import { EN_NOTIFICACIONES } from "./traducciones/notificaciones"
import { EN_COMMON } from "./traducciones/common"
import { EN_ACCOUNTS } from "./traducciones/accounts"
import { EN_WORKFLOWS } from "./traducciones/workflows"
import { EN_PAGES } from "./traducciones/pages"
import { EN_SERVER } from "./traducciones/server"
import { EN_DEMANDAS } from "./traducciones/demandas"
import { EN_EMPRESAS } from "./traducciones/empresas"
import { EN_FACTURACION } from "./traducciones/facturacion"

export type Idioma = "es" | "en"

export const IDIOMAS: { id: Idioma; etiqueta: string; corto: string }[] = [
  { id: "es", etiqueta: "Español", corto: "ES" },
  { id: "en", etiqueta: "English", corto: "EN" },
]

export const IDIOMA_COOKIE = "diime_idioma"
export const IDIOMA_POR_DEFECTO: Idioma = "es"

export function esIdiomaValido(v: string | undefined | null): v is Idioma {
  return v === "es" || v === "en"
}

type Diccionario = Record<string, string>

const ES: Diccionario = {
  // Navegación
  "nav.profesionales": "Profesionales",
  "nav.demandas": "Solicitudes de terceros",
  "nav.misDemandas": "Mis Solicitudes",
  "nav.misPujas": "Mis Pujas",
  "nav.proyectos": "Gestión de proyectos",
  "nav.mensajes": "Mensajes",
  "nav.entrar": "Iniciar sesión",
  "nav.registro": "Registrarse",
  "nav.miCuenta": "Mi cuenta",
  "nav.miPerfil": "Mi perfil",
  "nav.salir": "Cerrar sesión",
  "nav.idioma": "Idioma",

  // Portada
  "home.badge": "Profesionales en toda España",
  "home.titulo1": "Publica tu",
  "home.tituloResaltado": "solicitud",
  "home.titulo2": "y recibe ofertas en minutos",
  "home.subtitulo":
    "Describe lo que necesitas y conecta con profesionales cualificados al instante. Rápido, seguro y sin complicaciones.",
  "home.stat.profesionales": "Profesionales",
  "home.stat.valoracion": "Valoración media",
  "home.stat.pagos": "Pagos seguros",

  // Categorías
  "categorias.titulo": "Explora por especialidad",
  "categorias.subtitulo": "Encuentra al profesional adecuado para cualquier tipo de servicio",
  "categorias.verTodos": "Ver todos los profesionales",
  "categorias.servicios": "servicios",
  "categorias.servicio": "servicio",

  // Destacados y testimonios
  "destacados.titulo": "Profesionales destacados",
  "destacados.subtitulo": "Los mejor valorados por nuestros clientes",
  "testimonios.titulo": "Lo que dicen quienes ya nos usan",
  "testimonios.subtitulo": "Miles de clientes y profesionales confían en Diime cada día",

  // Cómo funciona
  "comoFunciona.etiqueta": "Cómo funciona",
  "comoFunciona.titulo": "Encuentra a tu profesional en 4 pasos",
  "comoFunciona.subtitulo":
    "Un proceso simple, transparente y seguro que te conecta con los mejores profesionales de tu zona",
  "comoFunciona.1.titulo": "Publica tu proyecto",
  "comoFunciona.1.texto": "Cuéntanos qué necesitas en menos de 2 minutos. Es gratis y sin compromiso.",
  "comoFunciona.2.titulo": "Recibe ofertas",
  "comoFunciona.2.texto": "Profesionales te enviarán sus mejores propuestas en pocas horas.",
  "comoFunciona.3.titulo": "Paga con seguridad",
  "comoFunciona.3.texto": "Tu dinero queda retenido hasta que el trabajo esté completado a tu satisfacción.",
  "comoFunciona.4.titulo": "Valora la experiencia",
  "comoFunciona.4.texto": "Comparte tu opinión para ayudar a otros usuarios y mejorar la comunidad.",

  // Llamada final
  "cta.badge": "Empieza gratis hoy mismo",
  "cta.titulo": "Tu próximo proyecto está a un clic",
  "cta.subtitulo": "Únete a miles de personas que ya están construyendo, reformando y mejorando con Diime",
  "cta.publicar": "Publicar un proyecto",
  "cta.soyProfesional": "Soy profesional",
  "cta.sinPermanencia": "Sin permanencia",
  "cta.pagosSeguros": "Pagos protegidos hasta la entrega",
  "cta.soporte": "Soporte 7 días a la semana",

  // Cookies
  "cookies.texto":
    "Usamos cookies necesarias para que Diime funcione (mantener tu sesión, por ejemplo). Nos gustaría usar además cookies opcionales para entender cómo se usa la web.",
  "cookies.masInfo": "Más información",
  "cookies.soloNecesarias": "Solo las necesarias",
  "cookies.aceptarTodas": "Aceptar todas",

  // Bienvenida
  "bienvenida.titulo": "Bienvenido a Diime",
  "bienvenida.subtitulo":
    "Conectamos a quien necesita un servicio con profesionales, con el pago protegido de principio a fin.",
  "bienvenida.cliente.etiqueta": "Necesito un servicio",
  "bienvenida.cliente.1": "Publicas gratis y recibes varias ofertas con precio y plazo.",
  "bienvenida.cliente.2": "Profesionales de tu provincia y especialidad.",
  "bienvenida.cliente.3": "Pagas por adelantado y la transferencia al profesional espera a tu confirmación.",
  "bienvenida.cliente.4": "Si algo no encaja, media el equipo de Diime.",
  "bienvenida.cliente.cta": "Publicar una demanda",
  "bienvenida.pro.etiqueta": "Soy profesional",
  "bienvenida.pro.1": "Más mercado: demandas de tu especialidad y tu zona, sin buscarlas.",
  "bienvenida.pro.2": "Cobro asegurado: el cliente paga antes de que empieces.",
  "bienvenida.pro.3": "Gestionas todos tus proyectos, entregas y mensajes en un sitio.",
  "bienvenida.pro.4": "Pujar es gratis.",
  "bienvenida.pro.cta": "Crear perfil profesional",
  "bienvenida.pie": "La transferencia al profesional solo se ejecuta cuando el cliente confirma el trabajo o se resuelve una disputa.",
}

const EN: Diccionario = {
  "La cancelación no tiene una aceptación fijada": "The cancellation has no recorded acceptance",
  "No tienes permiso para cerrar esta cancelación": "You do not have permission to close this cancellation",
  "Solo administración autoriza reintentos": "Only administrators can authorise retries",
  "El pago no admite otro reembolso": "This payment does not allow another refund",
  "El reembolso cambió: consulta su estado antes de autorizar otro intento": "The refund has changed: check its status before authorising another attempt",
  "El reembolso requiere conciliación antes de reintentarlo": "The refund requires reconciliation before it can be retried",
  "Estado de reembolso no válido": "Invalid refund status",
  "Demasiados trabajos": "Too many jobs",
  "Datos de planificación no válidos": "Invalid planning details",
  "Indica fechas y horas válidas": "Enter valid dates and hours",
  "La nota debe ser un texto": "The note must be text",
  "La reseña debe pertenecer al cliente autenticado": "The review must belong to the authenticated client",
  "No tienes permiso para dejar una reseña en este trabajo": "You do not have permission to review this job",
  "Solo puedes dejar reseña en trabajos completados": "You can only review completed jobs",
  "El profesional no corresponde al trabajo": "The professional does not match the job",
  "Indica una puntuación entre 1 y 5 y un comentario": "Enter a rating between 1 and 5 and a comment",
  "La identidad de la reseña es inmutable": "The review's identity cannot be changed",
  "Este trabajo ya tiene una reseña": "This job already has a review",
  "Indica una puntuación entera entre 1 y 5": "Enter a whole-number rating between 1 and 5",
  "La reputación se calcula a partir de reseñas verificadas": "Reputation is calculated from verified reviews",
  "Los proyectos completados se calculan a partir de los contratos": "Completed projects are calculated from contracts",
  "No puedes publicar este trabajo en tu portfolio": "You cannot publish this job in your portfolio",
  "Ese trabajo no está disponible para el portfolio": "That job is not available for the portfolio",
  "La demanda original no está disponible": "The original request is unavailable",
  "No se encontró la validación del actor en %": "Actor validation was not found in %",
  "Falta la referencia de origen del archivo": "The file's original reference is missing",
  "El pago cambió o requiere conciliación. Actualiza su estado.": "The payment has changed or requires reconciliation. Refresh its status.",
  "El reembolso no admite otro intento. Revisa su estado y cualquier contracargo en Stripe.": "The refund does not allow another attempt. Check its status and any chargeback in Stripe.",
  "El intento no ha completado la liquidación. Actualiza el estado; se conserva el mismo reparto y el historial para conciliarlo.": "The attempt did not complete settlement. Refresh the status; the same allocation and history are kept for reconciliation.",
  "Indica una puntuación entera entre 1 y 5 y un comentario": "Enter a whole-number rating between 1 and 5 and a comment",
  "No se pudo guardar la reseña. Inténtalo de nuevo.": "Unable to save the review. Try again.",
  "El intento anterior falló. Autoriza otro solo después de revisar la causa en Stripe. Si el banco no admite la devolución, será necesario acordar otra vía; este botón no registra pagos externos.": "The previous attempt failed. Authorise another only after reviewing the cause in Stripe. If the bank does not accept the refund, another method must be agreed; this button does not record external payments.",
  "Reintentando…": "Retrying…",
  "Autorizar un nuevo intento de reembolso": "Authorise a new refund attempt",
  "Tipo de archivo no permitido.": "File type not allowed.",
  "El archivo debe ocupar entre 1 byte y 10 MB.": "The file must be between 1 byte and 10 MB.",
  "El contenido del archivo no corresponde a su formato.": "The file contents do not match its format.",
  "Archivo no disponible.": "File unavailable.",
  "Debes iniciar sesión.": "You must sign in.",
  "No se pudo comprobar el acceso.": "Unable to check access.",
  "Almacenamiento no disponible.": "Storage unavailable.",
  "Cuenta no disponible.": "Account unavailable.",
  "Archivo demasiado grande.": "File too large.",
  "Uso de archivo no válido.": "Invalid file use.",
  "No file provided": "No file provided",
  "No tienes acceso a este archivo": "You do not have access to this file",
  "No se pudo cerrar la sesión": "Unable to sign out",
  "Tu sesión sigue abierta. Comprueba la conexión y vuelve a intentarlo.": "You are still signed in. Check your connection and try again.",
  "No se pudo cerrar la sesión. Comprueba la conexión y vuelve a intentarlo.": "Unable to sign out. Check your connection and try again.",
  "Comprueba la conexión y vuelve a intentarlo. Tu borrador se ha conservado.": "Check your connection and try again. Your draft has been kept.",
  // Navigation
  "nav.profesionales": "Professionals",
  "nav.demandas": "Requests",
  "nav.misDemandas": "My Requests",
  "nav.misPujas": "My Bids",
  "nav.proyectos": "Project management",
  "nav.mensajes": "Messages",
  "nav.entrar": "Sign in",
  "nav.registro": "Sign up",
  "nav.miCuenta": "My account",
  "nav.miPerfil": "My profile",
  "nav.salir": "Sign out",
  "nav.idioma": "Language",

  // Home
  "home.badge": "Professionals across Spain",
  "home.titulo1": "Post your",
  "home.tituloResaltado": "request",
  "home.titulo2": "and get offers in minutes",
  "home.subtitulo":
    "Tell us what you need and connect with qualified professionals right away. Fast, secure and hassle-free.",
  "home.stat.profesionales": "Professionals",
  "home.stat.valoracion": "Average rating",
  "home.stat.pagos": "Secure payments",

  // Categories
  "categorias.titulo": "Browse by speciality",
  "categorias.subtitulo": "Find the right professional for any kind of job",
  "categorias.verTodos": "See all professionals",
  "categorias.servicios": "services",
  "categorias.servicio": "service",

  // Featured and testimonials
  "destacados.titulo": "Featured professionals",
  "destacados.subtitulo": "The highest rated by our clients",
  "testimonios.titulo": "What people already using us say",
  "testimonios.subtitulo": "Thousands of clients and professionals trust Diime every day",

  // How it works
  "comoFunciona.etiqueta": "How it works",
  "comoFunciona.titulo": "Find your professional in 4 steps",
  "comoFunciona.subtitulo":
    "A simple, transparent and secure process that connects you with the best professionals in your area",
  "comoFunciona.1.titulo": "Post your project",
  "comoFunciona.1.texto": "Tell us what you need in under 2 minutes. It's free and with no strings attached.",
  "comoFunciona.2.titulo": "Get offers",
  "comoFunciona.2.texto": "Professionals will send you their best proposals within hours.",
  "comoFunciona.3.titulo": "Pay securely",
  "comoFunciona.3.texto": "The provider is paid only after you confirm the completed work.",
  "comoFunciona.4.titulo": "Leave a review",
  "comoFunciona.4.texto": "Share your experience to help others and improve the community.",

  // Final CTA
  "cta.badge": "Start for free today",
  "cta.titulo": "Your next project is one click away",
  "cta.subtitulo": "Join thousands of people already building, renovating and improving with Diime",
  "cta.publicar": "Post a project",
  "cta.soyProfesional": "I'm a professional",
  "cta.sinPermanencia": "No lock-in",
  "cta.pagosSeguros": "Protected payments until delivery",
  "cta.soporte": "Support 7 days a week",

  // Cookies
  "cookies.texto":
    "We use necessary cookies to make Diime work (keeping you signed in, for example). We'd also like to use optional cookies to understand how the site is used.",
  "cookies.masInfo": "More information",
  "cookies.soloNecesarias": "Necessary only",
  "cookies.aceptarTodas": "Accept all",

  // Welcome
  "bienvenida.titulo": "Welcome to Diime",
  "bienvenida.subtitulo":
    "We connect people who need a service with professionals, with the payment protected from start to finish.",
  "bienvenida.cliente.etiqueta": "I need a service",
  "bienvenida.cliente.1": "Post for free and get several offers with price and timeline.",
  "bienvenida.cliente.2": "Professionals in your province and speciality.",
  "bienvenida.cliente.3": "Pay up front; the provider transfer waits for your confirmation.",
  "bienvenida.cliente.4": "If something goes wrong, the Diime team steps in.",
  "bienvenida.cliente.cta": "Post a request",
  "bienvenida.pro.etiqueta": "I'm a professional",
  "bienvenida.pro.1": "More work: requests in your speciality and area, without hunting for them.",
  "bienvenida.pro.2": "Guaranteed payment: the client pays before you start.",
  "bienvenida.pro.3": "Manage all your projects, deliveries and messages in one place.",
  "bienvenida.pro.4": "Bidding is free.",
  "bienvenida.pro.cta": "Create professional profile",
  "bienvenida.pie": "The provider transfer is made only after client confirmation or dispute resolution.",
}

export const INGLES: Diccionario = { ...EN_AVISOS, ...EN_ADMIN_PAGOS, ...EN_COBROS, ...EN_REEMBOLSOS, ...EN_ACTIVIDAD, ...EN_NOTIFICACIONES, ...EN_COMMON, ...EN_ACCOUNTS, ...EN_WORKFLOWS, ...EN_PAGES, ...EN_SERVER, ...EN_DEMANDAS, ...EN_EMPRESAS, ...EN_FACTURACION, ...EN }
const DICCIONARIOS: Record<Idioma, Diccionario> = { es: ES, en: INGLES }
export type ParametrosTraduccion = Record<string, string | number>
export type Traductor = (clave: string, parametros?: ParametrosTraduccion) => string
export const localeDe = (idioma: Idioma) => idioma === "en" ? "en-GB" : "es-ES"

export function detectarIdioma(acceptLanguage: string | null): Idioma {
  const preferencias = (acceptLanguage || "").split(",").map((parte, orden) => {
    const [tag, ...opciones] = parte.trim().toLowerCase().split(";")
    const calidad = opciones.find((opcion) => opcion.trim().startsWith("q="))?.trim().slice(2)
    return { idioma: tag.split("-")[0], q: calidad === undefined ? 1 : Number(calidad), orden }
  }).filter(({ idioma, q }) => esIdiomaValido(idioma) && Number.isFinite(q) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q || a.orden - b.orden)
  return (preferencias[0]?.idioma as Idioma) || IDIOMA_POR_DEFECTO
}

// Missing source-text keys remain readable in their original language.
export function traducir(idioma: Idioma, clave: string, parametros?: ParametrosTraduccion): string {
  const texto = DICCIONARIOS[idioma]?.[clave] ?? ES[clave] ?? clave
  if (!parametros) return texto
  return texto.replace(/\{([a-zA-Z0-9_]+)\}/g, (original, nombre: string) =>
    Object.prototype.hasOwnProperty.call(parametros, nombre) ? String(parametros[nombre]) : original,
  )
}
