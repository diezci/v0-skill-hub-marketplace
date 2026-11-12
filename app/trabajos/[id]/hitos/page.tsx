"use client"

import { useParams } from "next/navigation"
import { PanelHitosTrabajo } from "@/components/hitos/trabajo-hitos"

export default function HitosTrabajoPage() {
  const { id } = useParams<{ id: string }>()
  return <PanelHitosTrabajo key={id} trabajoId={id} />
}
