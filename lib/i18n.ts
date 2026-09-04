// Traducciones de Diime.
//
// El idioma se guarda en una COOKIE, no solo en localStorage: media web
// (homepage, footer, /mi-cuenta…) son componentes de servidor, y para que el
// HTML llegue ya traducido el servidor tiene que poder leer la preferencia.
//
// Cobertura actual: la parte pública (navegación, portada, cookies y la
// bienvenida). El área privada sigue en español; las claves que falten caen al
// castellano en vez de mostrar la clave en crudo.

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
  "home.badge": "Profesionales verificados en toda España",
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
  "comoFunciona.2.texto": "Profesionales verificados te enviarán sus mejores propuestas en pocas horas.",
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
    "Conectamos a quien necesita un servicio con profesionales verificados, con el pago protegido de principio a fin.",
  "bienvenida.cliente.etiqueta": "Necesito un servicio",
  "bienvenida.cliente.1": "Publicas gratis y recibes varias ofertas con precio y plazo.",
  "bienvenida.cliente.2": "Profesionales verificados de tu provincia y especialidad.",
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
  "home.badge": "Verified professionals across Spain",
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
  "comoFunciona.2.texto": "Verified professionals will send you their best proposals within hours.",
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
    "We connect people who need a service with verified professionals, with the payment protected from start to finish.",
  "bienvenida.cliente.etiqueta": "I need a service",
  "bienvenida.cliente.1": "Post for free and get several offers with price and timeline.",
  "bienvenida.cliente.2": "Verified professionals in your province and speciality.",
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

const DICCIONARIOS: Record<Idioma, Diccionario> = { es: ES, en: EN }

// Devuelve la traducción, con el castellano como red de seguridad: si una clave
// aún no está en inglés se ve en español, que es mucho mejor que ver la clave.
export function traducir(idioma: Idioma, clave: string): string {
  return DICCIONARIOS[idioma]?.[clave] ?? ES[clave] ?? clave
}
