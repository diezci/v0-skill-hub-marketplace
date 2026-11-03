import type { ReactNode } from "react"
import { PRECIO_MAX } from "@/lib/precios"

export const datosInicialesPerfil = {
    nombre: "",
    apellido: "",
    titulo: "",
    ubicacion: "",
    bio: "",
    foto_perfil: "",
    foto_portada: "",
    telefono: "",
    email: "",
    rating: 0,
    total_reviews: 0,
    proyectos_completados: 0,
    anos_experiencia: 0,
    tarifa_hora: 0,
    tiempo_respuesta: "24 horas",
    nivel: "Profesional",
    disponibilidad: "Disponible",
    verificado: false,
    habilidades: [] as string[],
    // De servicio y provincia depende que llegue un aviso; el rango añade un
    // filtro opcional de presupuesto y empieza abierto para no ocultar nada.
    categorias_interes: [] as string[],
    provincias_cobertura: [] as string[],
    presupuesto_interes: [0, PRECIO_MAX] as [number, number],
    certificaciones: [] as string[],
    idiomas: [] as string[],
    portfolio: [] as any[],
    reviews: [] as any[],
    estadisticas: {
      entrega_tiempo: 0,
      calidad_trabajo: 0,
      comunicacion: 0,
      precio_calidad: 0,
    },
  }

export type DatosPerfilProfesional = typeof datosInicialesPerfil
export interface AdaptadorPerfilProfesional {
  identidad: string
  datos: DatosPerfilProfesional
  equipo: ReactNode
  guardar: (datos: DatosPerfilProfesional) => Promise<{ error?: string }>
  subirImagen: (file: File, tipo: "logo" | "portada" | "portfolio") => Promise<{ url: string } | null>
  obtenerPortfolio: () => Promise<{data?: any[]; error?: string}>
  crearProyecto: (data: any) => Promise<{error?: string}>
  actualizarProyecto: (id: string, data: any) => Promise<{error?: string}>
  eliminarProyecto: (id: string) => Promise<{error?: string}>
  obtenerTrabajos: () => Promise<{data?: any[]; error?: string}>
}
