"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ModalidadPagoSelector, PlanHitosEditor } from "@/components/hitos/plan-hitos-editor"
import { PanelHitosTrabajo, type PlanTrabajo } from "@/components/hitos/trabajo-hitos"
import { validarPlanHitos, type HitoBorrador, type ModalidadPago } from "@/lib/hitos"

const hitosEjemplo: HitoBorrador[] = [
  { id: "10000000-0000-4000-8000-000000000001", titulo: "Preparación y materiales", criterio_aceptacion: "Materiales recibidos y zona de trabajo preparada. Fotografías de los materiales y albaranes.", fecha_limite: "2026-12-01", importe_centimos: 240000 },
  { id: "10000000-0000-4000-8000-000000000002", titulo: "Instalaciones y obra", criterio_aceptacion: "Instalaciones terminadas y probadas. Fotografías del avance y acta de comprobación.", fecha_limite: "2026-12-15", importe_centimos: 480000 },
  { id: "10000000-0000-4000-8000-000000000003", titulo: "Acabados y equipamiento", criterio_aceptacion: "Pintura, pavimento y mobiliario instalados según el presupuesto.", fecha_limite: "2026-12-22", importe_centimos: 360000 },
  { id: "10000000-0000-4000-8000-000000000004", titulo: "Revisión y entrega final", criterio_aceptacion: "Revisión conjunta, incidencias resueltas y documentación final entregada.", fecha_limite: "2026-12-29", importe_centimos: 120000 },
]
const ejemplo: PlanTrabajo = {
  trabajo_id: "20000000-0000-4000-8000-000000000001", titulo: "Reforma del local", estado: "en_progreso", rol: "cliente", modalidad_pago: "hitos", plan_version: 1,
  precio_centimos: 1200000, propuesta: null, puede_editar: true, puede_aprobar: true, puede_entregar: false, puede_pagar: true,
  hitos: hitosEjemplo.map((hito, i) => ({ ...hito, orden: i + 1, activo: true, bloqueado: i < 2, estado: i === 0 ? "completado" : i === 1 ? "entregado" : "pendiente", comision_cliente_centimos: hito.importe_centimos / 10, escrow: i === 0 ? { id: "preview-payment", estado: "completado", base_liquidada_centimos: hito.importe_centimos, reembolso_servicio_centimos: 0 } : null, mensaje_entrega: i === 1 ? "Instalaciones terminadas. Hemos comprobado los puntos eléctricos y la estanqueidad." : undefined })),
}

export function PreviewHitos() {
  const [pantalla, setPantalla] = useState("trabajo")
  const [modalidad, setModalidad] = useState<ModalidadPago>("hitos")
  const [hitos, setHitos] = useState(hitosEjemplo)
  const [mensaje, setMensaje] = useState("")
  return <div className="pb-10 pt-20">
    <div className="mx-auto max-w-4xl space-y-4 px-4"><p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Vista previa local con datos de ejemplo. No publica, no envía propuestas y no realiza pagos.</p><nav aria-label="Pantallas de la vista previa" className="flex flex-wrap gap-2">{[["trabajo", "Seguimiento del trabajo"], ["solicitud", "Publicar solicitud"], ["oferta", "Responder presupuesto"]].map(([value, texto]) => <Button key={value} variant={pantalla === value ? "default" : "outline"} onClick={() => { setPantalla(value); setMensaje("") }}>{texto}</Button>)}</nav></div>
    {pantalla === "trabajo" ? <PanelHitosTrabajo trabajoId={ejemplo.trabajo_id} vistaPrevia={ejemplo} /> : <Card className="mx-4 mt-6 sm:mx-auto sm:max-w-2xl"><CardHeader><CardTitle>{pantalla === "solicitud" ? "Publicar solicitud · Forma de pago" : "Enviar presupuesto · Plan de pagos"}</CardTitle></CardHeader><CardContent><form className="space-y-5" onSubmit={event => { event.preventDefault(); setMensaje("Vista previa: se ha comprobado el formulario, no se ha enviado.") }}>
      <p className="text-sm text-muted-foreground">Reforma del local · Presupuesto de ejemplo: 12.000 €</p>
      <ModalidadPagoSelector value={modalidad} onChange={setModalidad} sugerencia={pantalla === "solicitud"} />
      {modalidad === "hitos" && <PlanHitosEditor value={hitos} onChange={setHitos} totalCentimos={1200000} sugerencia={pantalla === "solicitud"} error={pantalla === "oferta" ? validarPlanHitos(hitos, 1200000) : null} />}
      <Button type="submit" disabled={pantalla === "oferta" && modalidad === "hitos" && !!validarPlanHitos(hitos, 1200000)}>Comprobar formulario</Button>
      {mensaje && <p role="status" className="text-sm text-primary">{mensaje}</p>}
    </form></CardContent></Card>}
  </div>
}
