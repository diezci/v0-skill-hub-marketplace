/** @type {import('next').NextConfig} */
const nextConfig = {
  // La navegación inferior de la app ocupa esa esquina; el indicador de
  // desarrollo se desactiva para que las previsualizaciones nativas sean fieles.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
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
