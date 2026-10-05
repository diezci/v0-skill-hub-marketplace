"use client"

import Link from "next/link"
import { ArrowRight, Building2 } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"

export function AfiliacionEmpresa({ empresaId, nombre, cargo }: { empresaId: string; nombre: string; cargo: string }) {
  const t = useT()
  return <aside className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4"><div className="flex items-center gap-3"><Building2 className="size-6 text-muted-foreground" /><div><p className="text-sm text-muted-foreground">{cargo || t("Miembro del equipo")}</p><Link href={`/empresa/${empresaId}`} className="font-semibold hover:underline">{nombre}</Link></div></div><Button variant="outline" size="sm" asChild><Link href={`/empresa/${empresaId}`}>{t("Ver empresa")}<ArrowRight className="size-4" /></Link></Button></aside>
}
