"use client"

import { useMemo, useState } from "react"
import { Building2, ShieldCheck, UserRound } from "lucide-react"
import PerfilProfesional from "@/components/perfil-profesional"
import { AcreditacionProfesionalForm, acreditacionVacia } from "@/components/acreditacion-profesional-form"
import { datosInicialesPerfil, type AdaptadorPerfilProfesional } from "@/lib/perfil-profesional-editor"
import { Button } from "@/components/ui/button"
import { useT } from "@/components/idioma-provider"

export function PerfilUnificadoPreview() {
  const t = useT()
  const [acreditacion, setAcreditacion] = useState(acreditacionVacia)
  const [pestana, setPestana] = useState("perfil")
  const [mensaje, setMensaje] = useState("")
  const empresa = acreditacion.tipoProveedor === "empresa"
  const adaptador = useMemo<AdaptadorPerfilProfesional>(() => ({
    identidad: `demo-${empresa ? 'empresa' : 'particular'}`,
    datos: { ...datosInicialesPerfil, nombre: empresa ? "Reformas Norte" : "Elena", apellido: empresa ? "" : "García", titulo: "Reformas y mantenimiento del hogar", ubicacion: "Bilbao y alrededores", bio: "Nos ocupamos de las reparaciones y mejoras de tu hogar con atención al detalle, presupuestos claros y comunicación durante todo el trabajo.", verificado: true, nivel: "Profesional Verificado", anos_experiencia: 8, proyectos_completados: 12, rating: 4.8, total_reviews: 9, habilidades: ["Pintura", "Mantenimiento"], idiomas: ["Español"], portfolio: [] },
    equipo: null, guardar: async () => ({ error: "Vista previa local" }), subirImagen: async () => null,
    obtenerPortfolio: async () => ({ data: [] }), crearProyecto: async () => ({}), actualizarProyecto: async () => ({}), eliminarProyecto: async () => ({}), obtenerTrabajos: async () => ({ data: [] }),
  }), [empresa])

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">{t("Vista previa local · Datos de ejemplo")}</p>
      <h1 className="mt-2 text-2xl font-semibold">{t("Un perfil profesional para todos")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("Mismo perfil y mismas herramientas. Las acreditaciones se adaptan a quién presta el servicio.")}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant={!empresa ? "default" : "outline"} onClick={() => setAcreditacion({ ...acreditacion, tipoProveedor: 'particular' })}><UserRound className="mr-2 size-4" />{t("Profesional particular")}</Button>
        <Button variant={empresa ? "default" : "outline"} onClick={() => setAcreditacion({ ...acreditacion, tipoProveedor: 'empresa' })}><Building2 className="mr-2 size-4" />{t("Empresa")}</Button>
      </div>
    </div>
    <nav className="flex gap-2 border-b pb-3" aria-label={t("Vista previa")}><Button variant={pestana === 'perfil' ? 'secondary' : 'ghost'} onClick={() => setPestana('perfil')}>{t("Perfil")}</Button><Button variant={pestana === 'acreditacion' ? 'secondary' : 'ghost'} onClick={() => setPestana('acreditacion')}><ShieldCheck className="mr-2 size-4" />{t("Acreditaciones")}</Button></nav>
    {pestana === 'perfil' ? <PerfilProfesional key={adaptador.identidad} adaptador={adaptador} editable={false} /> : <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-5 sm:p-8">
      <h2 className="text-xl font-semibold">{t("Verificación por Diime")}</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">{t("Identidad, actividad y representación, revisadas por el equipo de Diime.")}</p>
      <form onSubmit={e => { e.preventDefault(); setMensaje('Esta es una demostración. No se ha enviado ninguna solicitud.') }}>
        <AcreditacionProfesionalForm value={acreditacion} onChange={setAcreditacion} demostracion />
        <Button type="submit" disabled={!acreditacion.consentimiento} className="mt-6 w-full sm:w-auto">{t("Enviar acreditaciones a Diime")}</Button>
        {mensaje && <p role="status" className="mt-3 text-sm text-muted-foreground">{t(mensaje)}</p>}
      </form>
    </div>}
  </main>
}
