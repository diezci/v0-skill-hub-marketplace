import { getT } from "@/lib/i18n-servidor"
import { localeDe } from "@/lib/i18n"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import PerfilProfesionalPublico from "@/components/perfil-profesional-publico"
import { obtenerProfesionalPorId } from "@/app/actions/profiles"
import PerfilMiembro from "@/components/empresas/perfil-miembro"
import { esEmpresasLocal, obtenerEmpleadoEmpresa } from "@/lib/empresas/service"

// Esta página lee la sesión (cookies) para personalizar acciones; debe
// renderizarse siempre en el servidor por request, nunca como shell estático
// (un `generateStaticParams` vacío aquí causaba "static to dynamic at runtime"
// y un 500 en cada visita).
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t } = await getT()

  try {
    const { id } = await params
    if (esEmpresasLocal()) {
      const miembro = await obtenerEmpleadoEmpresa(id)
      if (miembro) return { title: `${miembro.perfil.nombre} - ${miembro.empresa.empresa.nombre} | Diime`, description: miembro.perfil.bio, robots: { index: false, follow: false } }
      return { title: t("Perfil no encontrado | Diime"), robots: { index: false, follow: false } }
    }
    const result = await obtenerProfesionalPorId(id)

    if (!result.data) {
      return { title: t("Perfil no encontrado | Diime") }
    }

    const profile = result.data
    const nombre = `${profile.perfil?.nombre || ""} ${profile.perfil?.apellido || ""}`.trim()

    return {
      title: `${nombre} - ${profile.titulo || t("Profesional")} | Diime`,
      description: `${profile.perfil?.bio || t("Profesional en Diime")} - ${t(profile.proyectos_completados === 1 ? "{cantidad} proyecto completado." : "{cantidad} proyectos completados.", { cantidad: profile.proyectos_completados || 0 })}`,
    }
  } catch {
    return { title: t("Perfil | Diime") }
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ valorar?: string }>
}) {
  const { t, idioma } = await getT()

  const { id } = await params
  if (esEmpresasLocal()) {
    const miembro = await obtenerEmpleadoEmpresa(id)
    if (!miembro) notFound()
    return <PerfilMiembro perfil={miembro.perfil} empresa={miembro.empresa} />
  }
  // Llegar con ?valorar=1 (p. ej. desde el botón "Valorar" del chat) abre
  // directamente la pestaña de valoraciones.
  const { valorar } = await searchParams

  let result: Awaited<ReturnType<typeof obtenerProfesionalPorId>> | undefined

  try {
    result = await obtenerProfesionalPorId(id)
  } catch {
    notFound()
  }

  if (!result?.data) {
    notFound()
  }

  const profile = result!.data!

  const mappedProfile = {
    id: profile.id,
    nombre: profile.perfil?.nombre || "",
    apellido: profile.perfil?.apellido || "",
    titulo: profile.titulo || "",
    ubicacion: profile.perfil?.ubicacion || "",
    // La descripción vive en `profiles.bio`: la tabla `profesionales` no tiene
    // columna bio, así que leerla de ahí dejaba "Sobre mí" siempre en blanco.
    bio: profile.perfil?.bio || "",
    foto_perfil: profile.perfil?.foto_perfil || "",
    foto_portada: profile.perfil?.foto_portada || "",
    telefono: profile.perfil?.telefono || "",
    rating: profile.rating_promedio || 0,
    total_reviews: profile.total_reviews || 0,
    proyectos_completados: profile.proyectos_completados || 0,
    anos_experiencia: profile["años_experiencia"] ?? profile.anos_experiencia ?? 0,
    tarifa_hora: profile.tarifa_por_hora || 0,
    tiempo_respuesta: profile.tiempo_respuesta || t("24 horas"),
    nivel: profile.verificado ? "Experto Verificado" : "Profesional",
    disponibilidad: profile.disponible ? "Disponible" : "No disponible",
    verificado: profile.verificado || false,
    cuenta_eliminada: profile.perfil?.cuenta_eliminada || null,
    habilidades: profile.habilidades || [],
    certificaciones: profile.certificaciones || [],
    idiomas: profile.idiomas || [],
    portfolio: (profile.portfolio || []).map((item: any) => ({
      id: item.id,
      titulo: item.titulo,
      descripcion: item.descripcion,
      categoria: item.categoria,
      imagen: item.imagen || "",
      trabajo_id: item.trabajo_id,
      contexto_proveedor: item.contexto_proveedor,
      ubicacion: item.ubicacion,
      duracion: item.duracion,
      fecha_proyecto: item.fecha_proyecto,
      rango_precio: item.rango_precio,
    })),
    reviews: (profile.reviews || []).map((review: any) => ({
      id: review.id,
      // El punto solo si hay inicial: si no, la reseña salía firmada como "Lale .".
      cliente: [review.cliente?.nombre, review.cliente?.apellido?.charAt(0) ? `${review.cliente.apellido.charAt(0)}.` : null]
        .filter(Boolean)
        .join(" "),
      avatar: review.cliente?.foto_perfil || "",
      rating: review.rating,
      fecha: review.created_at
        ? new Date(review.created_at).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short" })
        : review.fecha_creacion
        ? new Date(review.fecha_creacion).toLocaleDateString(localeDe(idioma), { day: "numeric", month: "short" })
        : "",
      texto: review.comentario,
      proyecto: review.tipo_proyecto || t("Proyecto"),
    })),
    estadisticas: {
      entrega_tiempo: 95,
      calidad_trabajo: 98,
      comunicacion: 96,
      precio_calidad: 94,
    },
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PerfilProfesionalPublico perfil={mappedProfile} tabInicial={valorar ? "valoraciones" : "sobre"} />
    </div>
  )
}
