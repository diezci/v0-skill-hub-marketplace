import { idiomaActual } from "@/lib/i18n-servidor"

import type { MetadataRoute } from "next"

// Manifest de la PWA: es lo que permite instalar Diime en el móvil (y el
// requisito de partida tanto para Google Play vía TWA como para envolverla más
// adelante en iOS).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const idioma = await idiomaActual()
  const ingles = idioma === "en"
  return {
    name: ingles ? "Diime — Professionals and services" : "Diime — Profesionales y servicios",
    short_name: "Diime",
    description:
      ingles ? "Post your request and receive offers from professionals, with payment protected from start to finish." : "Publica tu demanda y recibe ofertas de profesionales, con el pago protegido de principio a fin.",
    start_url: "/",
    scope: "/",
    // `standalone`: al abrirla desde el icono se ve sin barra de navegador,
    // como una app. Google Play (TWA) exige standalone o fullscreen.
    display: "standalone",
    orientation: "portrait",
    lang: idioma,
    dir: "ltr",
    background_color: "#0a0a0a",
    theme_color: "#059669",
    categories: ["business", "productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png?v=logo-safe-3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=logo-safe-3", sizes: "512x512", type: "image/png", purpose: "any" },
      // "maskable" deja que Android recorte el icono a la forma del lanzador
      // (círculo, cuadrado redondeado…). El icono lleva margen de seguridad para
      // que la "d" no se corte.
      { src: "/icons/icon-maskable-512.png?v=logo-safe-3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: ingles ? "Post a request" : "Publicar una demanda", url: "/" },
      { name: ingles ? "Browse requests" : "Ver demandas", url: "/demandas" },
      { name: ingles ? "Messages" : "Mensajes", url: "/mensajes" },
    ],
  }
}
