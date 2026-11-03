"use client"

import Link from "next/link"
import { ArrowRight, Users } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import type { EmpresaPublica } from "@/lib/empresas/types"

export function InicialesEmpresa({ nombre, className = "", fotoUrl }: { nombre: string; className?: string; fotoUrl?: string }) {
  return <Avatar className={className}><AvatarImage src={fotoUrl} alt={nombre} /><AvatarFallback className="bg-muted text-foreground">{nombre.split(" ").filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("")}</AvatarFallback></Avatar>
}

export function EquipoEmpresa({ datos }: { datos: EmpresaPublica }) {
  const t = useT()
  const miembros = datos.miembros.filter((miembro) => miembro.perfilPublico)
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("Personas que la empresa presenta en su equipo público.")}</p>
    {miembros.length ? <div className="grid gap-4 sm:grid-cols-2">{miembros.map((miembro) => <article key={miembro.id} className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <InicialesEmpresa nombre={miembro.nombre} fotoUrl={miembro.fotoUrl} className="size-12 shrink-0" />
        <div className="min-w-0"><h3 className="break-words font-semibold">{miembro.nombre}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{miembro.cargo}</p></div>
      </div>
      {miembro.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{miembro.bio}</p>}
      {(datos.local || miembro.tienePerfilProfesional) && <Link href={`/profesional/${encodeURIComponent(miembro.usuarioId)}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">{t("Ver perfil profesional")}<ArrowRight className="size-4" /></Link>}
    </article>)}</div> : <Card><CardContent className="py-8 text-center"><Users className="mx-auto mb-3 size-7 text-muted-foreground" /><h3 className="text-sm font-medium">{t("El equipo todavía no es público")}</h3><p className="mt-2 text-sm text-muted-foreground">{t("Puedes solicitar un presupuesto directamente a la empresa.")}</p></CardContent></Card>}
  </div>
}
