"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, MapPin, Users } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InicialesEmpresa, SolicitarPresupuestoEmpresa, TrabajoEmpresaCard } from "@/components/empresas/perfil-empresa"
import type { EmpresaPublica, MiembroEmpresaPublico } from "@/lib/empresas/types"

export default function PerfilMiembro({ perfil, empresa: datos }: { perfil: MiembroEmpresaPublico; empresa: EmpresaPublica }) {
  const t = useT()
  const { empresa } = datos
  const vinculoActivo = datos.miembros.some((miembro) => miembro.usuarioId === perfil.usuarioId)
  const contribuciones = datos.trabajos.filter((trabajo) => trabajo.participantesIds.includes(perfil.usuarioId))
  const empresaUrl = `/empresa/${encodeURIComponent(empresa.slug)}`

  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <Link href={empresaUrl} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4 shrink-0" />{t("Volver a {empresa}", { empresa: empresa.nombre })}</Link>
    <Card className="overflow-hidden">
      <div className="relative h-32 bg-gradient-to-r from-primary/20 to-primary/5 sm:h-44" />
      <CardContent className="pt-0">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row">
          <InicialesEmpresa nombre={perfil.nombre} className="relative size-24 shrink-0 border-4 border-background text-2xl shadow-lg sm:size-28" />
          <div className="min-w-0 flex-1 sm:pt-14">
            <div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-bold">{perfil.nombre}</h1><Badge variant="secondary" className="gap-1"><Users className="size-3.5" />{t(vinculoActivo ? "Miembro del equipo" : "Colaboración anterior")}</Badge></div>
            <p className="mt-1 text-muted-foreground">{perfil.cargo}</p>
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" />{empresa.ubicacion}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><Building2 className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{t(vinculoActivo ? "Actúa en nombre de" : "Colaboró con")}</p><Link href={empresaUrl} className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold hover:underline">{empresa.nombre}{empresa.estadoVerificacion === "verificada" && <BadgeCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-label={t("Empresa verificada")} />}</Link></div></div>
          <Button asChild variant="outline" size="sm" className="bg-transparent"><Link href={empresaUrl}>{t("Ver empresa")}<ArrowRight className="size-4" /></Link></Button>
        </div>
        {vinculoActivo ? <div className="mt-5"><SolicitarPresupuestoEmpresa datos={datos} className="w-full sm:w-auto" /><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("El presupuesto y la contratación corresponden a {empresa}.", { empresa: empresa.razonSocial.replace(/\.+$/, "") })}</p></div> : <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("Esta persona ya no tiene acceso para actuar en nombre de la empresa. Su participación en los trabajos anteriores se conserva.")}</p>}
      </CardContent>
    </Card>

    <Tabs defaultValue="sobre" className="w-full">
      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sobre">{t("Sobre mí")}</TabsTrigger><TabsTrigger value="trabajos">{t("Trabajos")} ({contribuciones.length})</TabsTrigger></TabsList>
      <TabsContent value="sobre"><Card><CardContent className="space-y-6">
        <section><h2 className="mb-2 font-semibold">{t("Descripción")}</h2><p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{perfil.bio || t("Esta persona todavía no ha añadido una presentación.")}</p></section>
        <section><h2 className="mb-2 font-semibold">{t("Habilidades")}</h2>{perfil.habilidades.length ? <div className="flex flex-wrap gap-2">{perfil.habilidades.map((habilidad) => <Badge key={habilidad} variant="secondary" className="max-w-full whitespace-normal">{habilidad}</Badge>)}</div> : <p className="text-sm text-muted-foreground">{t("Todavía no se han publicado especialidades.")}</p>}</section>
      </CardContent></Card></TabsContent>
      <TabsContent value="trabajos" className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("Participación en trabajos contratados a {empresa}.", { empresa: empresa.nombre })}</p>
        {contribuciones.length ? <div className="grid gap-4 sm:grid-cols-2">{contribuciones.map((trabajo) => <TrabajoEmpresaCard key={trabajo.id} trabajo={trabajo} participacion />)}</div> : <Card><CardContent className="py-8 text-center"><BriefcaseBusiness className="mx-auto mb-3 size-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t("Todavía no hay participaciones publicadas.")}</p></CardContent></Card>}
        <p className="text-xs leading-relaxed text-muted-foreground">{t("Las valoraciones de estos trabajos pertenecen a la empresa y se consultan en su perfil.")}</p>
      </TabsContent>
    </Tabs>
  </div>
}
