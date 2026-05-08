import type { Metadata } from "next"
import { notFound } from "next/navigation"
import PerfilProfesional from "@/components/perfil-profesional"
import { obtenerProfesionalPorId } from "@/app/actions/profiles"
import { isFavorito } from "@/app/actions/favoritos"
import { FavoriteButton } from "@/components/favorite-button"
import { TrustBadges } from "@/components/trust-badges"

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { id } = params
  const result = await obtenerProfesionalPorId(id)

  if (!result.data) {
    return {
      title: "Perfil no encontrado",
    }
  }

  const profile = result.data
  const nombre = `${profile.perfil?.nombre || ""} ${profile.perfil?.apellido || ""}`

  return {
    title: `${nombre} - ${profile.titulo} | Diime`,
    description: `${profile.bio} - ${profile.proyectos_completados} proyectos completados.`,
  }
}

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const { id } = params
  const result = await obtenerProfesionalPorId(id)

  if (!result.data) {
    notFound()
  }

  const profile = result.data

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
    anos_experiencia: profile.anos_experiencia || 0,
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
      imagen: item.imagen_url,
    })),
    reviews: (profile.reviews || []).map((review: any) => ({
      id: review.id,
      cliente: `${review.cliente?.nombre || ""} ${review.cliente?.apellido?.charAt(0) || ""}.`,
      avatar: review.cliente?.foto_perfil || "",
      rating: review.rating,
      fecha: new Date(review.fecha_creacion).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
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

  const isFav = await isFavorito(id)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <TrustBadges
          verificado={mappedProfile.verificado}
          totalTrabajos={mappedProfile.proyectos_completados}
          ratingPromedio={mappedProfile.rating}
          totalResenas={mappedProfile.total_reviews}
        />
        <FavoriteButton profesionalId={id} initialIsFavorite={isFav} showLabel size="sm" />
      </div>
      <PerfilProfesional editable={false} perfil={mappedProfile} />
    </div>
  )
}
