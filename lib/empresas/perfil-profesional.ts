import type { EmpresaPublica } from "@/lib/empresas/types"

// Both company surfaces use the corresponding professional renderer. This
// adapter only translates persisted company data; it never reads an account.
export function perfilProfesionalDeEmpresa(datos: EmpresaPublica, locale = "es-ES") {
  const { empresa, trabajos, resenas } = datos
  const totalReviews = datos.totalResenas ?? resenas.length
  const rating = datos.ratingPromedio ?? (resenas.length ? resenas.reduce((sum, resena) => sum + resena.puntuacion, 0) / resenas.length : 0)
  return {
    id: empresa.id,
    nombre: empresa.nombre,
    apellido: "",
    titulo: empresa.titulo || "",
    ubicacion: empresa.ubicacion,
    bio: empresa.descripcion,
    foto_perfil: empresa.logoUrl || "",
    foto_portada: empresa.portadaUrl || "",
    telefono: empresa.telefono || "",
    email: empresa.emailContacto || "",
    rating,
    total_reviews: totalReviews,
    proyectos_completados: empresa.proyectosCompletados ?? 0,
    anos_experiencia: empresa.anosExperiencia ?? 0,
    tarifa_hora: empresa.tarifaHora ?? 0,
    tiempo_respuesta: empresa.tiempoRespuesta || "24 horas",
    nivel: empresa.estadoVerificacion === "verificada" ? "Profesional Verificado" : "Profesional",
    disponibilidad: empresa.disponible === false ? "No disponible" : "Disponible",
    verificado: empresa.estadoVerificacion === "verificada",
    habilidades: empresa.habilidades || [],
    categorias_interes: empresa.servicios,
    provincias_cobertura: empresa.provincias || [],
    certificaciones: empresa.certificaciones || [],
    idiomas: empresa.idiomas || [],
    portfolio: trabajos.map((trabajo) => ({
      id: trabajo.id,
      titulo: trabajo.titulo,
      descripcion: trabajo.descripcion,
      categoria: trabajo.categoria,
      imagen: trabajo.imagen || "",
      imagen_url: trabajo.imagen || "",
      trabajo_id: trabajo.trabajoId,
      duracion: trabajo.duracion || "",
      contexto_proveedor: trabajo.contextoProveedor || "",
      imagenes: trabajo.imagenes || (trabajo.imagen ? [trabajo.imagen] : []),
      ubicacion: trabajo.ubicacion,
      fecha_proyecto: trabajo.fecha,
      rango_precio: trabajo.rangoPrecio,
    })),
    reviews: resenas.map((resena) => ({
      id: resena.id,
      cliente: resena.autor,
      avatar: "",
      rating: resena.puntuacion,
      fecha: resena.fecha ? new Date(`${resena.fecha.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }) : "",
      texto: resena.comentario,
      proyecto: trabajos.find((trabajo) => trabajo.trabajoId === resena.trabajoId)?.titulo || "",
    })),
    estadisticas: { entrega_tiempo: 0, calidad_trabajo: 0, comunicacion: 0, precio_calidad: 0 },
  }
}
