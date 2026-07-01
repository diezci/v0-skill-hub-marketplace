import type { Metadata } from "next"
import { notFound } from "next/navigation"
import PerfilProfesionalPublico from "@/components/perfil-profesional-publico"
import { obtenerProfesionalPorId } from "@/app/actions/profiles"

// Esta página lee la sesión (cookies) para personalizar acciones; debe
// renderizarse siempre en el servidor por request, nunca como shell estático
// (un `generateStaticParams` vacío aquí causaba "static to dynamic at runtime"
// y un 500 en cada visita).
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params
    const result = await obtenerProfesionalPorId(id)

    if (!result.data) {
      return { title: "Perfil no encontrado | Diime" }
    }

    const profile = result.data
    const nombre = `${profile.perfil?.nombre || ""} ${profile.perfil?.apellido || ""}`.trim()

    return {
      title: `${nombre} - ${profile.titulo || "Profesional"} | Diime`,
      description: `${profile.bio || "Profesional verificado en Diime"} - ${profile.proyectos_completados || 0} proyectos completados.`,
    }
  } catch {
    return { title: "Perfil | Diime" }
  }
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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
    bio: profile.bio || "",
    foto_perfil: profile.perfil?.foto_perfil || "",
    foto_portada: profile.perfil?.foto_portada || "",
    telefono: profile.perfil?.telefono || "",
    email: profile.perfil?.email || "",
    rating: profile.rating_promedio || 0,
    total_reviews: profile.total_reviews || 0,
    proyectos_completados: profile.proyectos_completados || 0,
    anos_experiencia: profile["años_experiencia"] ?? profile.anos_experiencia ?? 0,
    tarifa_hora: profile.tarifa_por_hora || 0,
    tiempo_respuesta: profile.tiempo_respuesta || "24 horas",
    nivel: profile.verificado ? "Experto Verificado" : "Profesional",
    disponibilidad: profile.disponible ? "Disponible" : "No disponible",
    verificado: profile.verificado || false,
    habilidades: profile.habilidades || [],
    certificaciones: profile.certificaciones || [],
    idiomas: profile.idiomas || [],
    portfolio: (profile.portfolio || []).map((item: any) => ({
      id: item.id,
      titulo: item.titulo,
      descripcion: item.descripcion,
      imagen: item.imagen_url || (Array.isArray(item.imagenes) ? item.imagenes[0] : ""),
    })),
    reviews: (profile.reviews || []).map((review: any) => ({
      id: review.id,
      cliente: `${review.cliente?.nombre || ""} ${review.cliente?.apellido?.charAt(0) || ""}.`,
      avatar: review.cliente?.foto_perfil || "",
      rating: review.rating,
      fecha: review.created_at
        ? new Date(review.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
        : review.fecha_creacion
        ? new Date(review.fecha_creacion).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
        : "",
      texto: review.comentario,
      proyecto: review.tipo_proyecto || "Proyecto",
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
      <PerfilProfesionalPublico perfil={mappedProfile} />
    </div>
  )
}
