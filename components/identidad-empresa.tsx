"use client"

import Link from "next/link"
import { Building2 } from "lucide-react"
import { useT } from "@/components/idioma-provider"

export function IdentidadEmpresa({ empresa, actor }: { empresa?: { id: string; nombre: string } | null; actor?: string }) {
  const t = useT()
  if (!empresa) return null
  return <div className="my-2 text-sm">
    <Link href={`/empresa/${encodeURIComponent(empresa.id)}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><Building2 className="size-4 shrink-0" />{empresa.nombre}</Link>
    {actor && <p className="text-xs text-muted-foreground">{t("Gestionado por {nombre}", { nombre: actor })}</p>}
  </div>
}
