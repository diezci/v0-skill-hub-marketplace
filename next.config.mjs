/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Preserve query parameters in historical company emails and push links.
    return [{ source: "/perfil-empresa", destination: "/mi-empresa", permanent: false }]
  },
  // La revisión local de empresas conserva su compilación separada del trabajo habitual.
  distDir: process.env.DIIME_EMPRESAS_LOCAL === "1" && process.env.NODE_ENV !== "production" ? ".next-empresas" : ".next",
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // El multipart añade cabeceras al archivo permitido de 10 MiB.
    // Este límite del proxy no modifica el límite de payload del hosting.
    proxyClientMaxBodySize: "12mb",
    // El recorrido E2E local abre muchas rutas y no necesita conservar la caché.
    ...(process.env.DIIME_E2E_LOCAL === "1" && process.env.NODE_ENV === "development"
      ? { turbopackFileSystemCacheForDev: false, turbopackMemoryLimit: 2 * 1024 ** 3 }
      : {}),
  },
  // Vercel asigna un identificador único por despliegue para Skew Protection.
  // Un SHA puede generar varios despliegues (preview, producción o reintentos).
  // La navegación inferior de la app ocupa esa esquina; el indicador de
  // desarrollo se desactiva para que las previsualizaciones nativas sean fieles.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  // Sin esto Turbopack infiere la raíz del workspace buscando lockfiles hacia
  // arriba, y puede acabar eligiendo uno ajeno al proyecto.
  turbopack: {
    root: import.meta.dirname,
  },
  // La clave `eslint` ya no existe en Next 16: el build no ejecuta eslint, así
  // que ignoreDuringBuilds sobraba y la config la rechazaba como desconocida.
}

export default nextConfig
