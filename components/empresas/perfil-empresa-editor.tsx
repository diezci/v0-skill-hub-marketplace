"use client"

import { guardarPerfilEmpresa } from "@/app/actions/empresa-workspace"
import { crearItemPortfolioEmpresa, actualizarItemPortfolioEmpresa, eliminarItemPortfolioEmpresa, obtenerPortfolioEmpresa, obtenerTrabajosCompletadosParaPortfolioEmpresa } from "@/app/actions/portfolio-empresa"
import PerfilProfesional from "@/components/perfil-profesional"
import { EquipoEmpresa } from "@/components/empresas/equipo-empresa"
import { perfilProfesionalDeEmpresa } from "@/lib/empresas/perfil-profesional"
import type { EmpresaPublica } from "@/lib/empresas/types"
import type { AdaptadorPerfilProfesional, DatosPerfilProfesional } from "@/lib/perfil-profesional-editor"
import { PRECIO_MAX } from "@/lib/precios"

export function cambiosPerfilEmpresa(datos: DatosPerfilProfesional, empresa: EmpresaPublica["empresa"]) {
  return {
    ...(datos.datos_empresa ? { domicilio: datos.datos_empresa.domicilio } : {}),
    nombre: datos.nombre.trim(), descripcion: datos.bio, ubicacion: datos.ubicacion,
    web: empresa.web, logoUrl: datos.foto_perfil, portadaUrl: datos.foto_portada,
    servicios: datos.categorias_interes, provincias: datos.provincias_cobertura,
    presupuestoMinInteres: datos.presupuesto_interes[0] <= 0 ? null : datos.presupuesto_interes[0],
    presupuestoMaxInteres: datos.presupuesto_interes[1] >= PRECIO_MAX ? null : datos.presupuesto_interes[1],
    titulo: datos.titulo, telefono: datos.telefono, emailContacto: datos.email,
    tarifaHora: datos.tarifa_hora, anosExperiencia: datos.anos_experiencia,
    habilidades: datos.habilidades, certificaciones: datos.certificaciones, idiomas: datos.idiomas,
  }
}

export async function subirImagenEmpresa(file: File, empresaId: string, tipo: "logo" | "portada" | "portfolio") {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > 3 * 1024 * 1024) return null
  const body = new FormData()
  body.append("file", file)
  body.append("empresaId", empresaId)
  try {
    const response = await fetch(`/api/empresas/${tipo}`, { method: "POST", body })
    const result = await response.json().catch(() => null)
    return response.ok && typeof result?.url === "string" && result.url ? { url: result.url } : null
  } catch { return null }
}

// The company supplies data and authorized actions; the entire UI is the same
// professional profile, including its image controls, portfolio and statistics.
export function PerfilEmpresaEditor({ datos, puedeEditar, integrado = false, onGuardar = guardarPerfilEmpresa }: {
  datos: EmpresaPublica
  puedeEditar: boolean
  integrado?: boolean
  onGuardar?: typeof guardarPerfilEmpresa
}) {
  const adaptador: AdaptadorPerfilProfesional = {
    identidad: `empresa:${datos.empresa.id}`,
    datos: {
      ...perfilProfesionalDeEmpresa(datos),
      presupuesto_interes: [datos.empresa.presupuestoMinInteres ?? 0, datos.empresa.presupuestoMaxInteres ?? PRECIO_MAX],
    },
    equipo: <EquipoEmpresa datos={datos} />,
    guardar: (cambios) => onGuardar(cambiosPerfilEmpresa(cambios, datos.empresa)),
    subirImagen: (file, tipo) => subirImagenEmpresa(file, datos.empresa.id, tipo),
    obtenerPortfolio: puedeEditar ? obtenerPortfolioEmpresa : async () => ({ data: perfilProfesionalDeEmpresa(datos).portfolio }),
    crearProyecto: crearItemPortfolioEmpresa,
    actualizarProyecto: actualizarItemPortfolioEmpresa,
    eliminarProyecto: eliminarItemPortfolioEmpresa,
    obtenerTrabajos: obtenerTrabajosCompletadosParaPortfolioEmpresa,
  }
  return <div id="perfil-empresa" className={integrado ? "min-w-0" : "container mx-auto px-4 py-8"}>
    <PerfilProfesional key={adaptador.identidad} editable={puedeEditar} adaptador={adaptador} />
  </div>
}
