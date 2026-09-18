"use client"

import Link from "next/link"
import { ArrowRight, BadgeCheck, Building2, MapPin, Star } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { EmpresaPublica } from "@/lib/empresas/types"

export default function TarjetaEmpresa({ datos }: { datos: EmpresaPublica }) {
  const t = useT()
  const { empresa, resenas } = datos
  const rating = resenas.length ? resenas.reduce((suma, resena) => suma + resena.puntuacion, 0) / resenas.length : null
  return <Card className="h-full overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
    <CardContent className="space-y-4">
      <div className="flex items-start gap-3"><Avatar className="size-12 shrink-0"><AvatarFallback><Building2 className="size-6 text-muted-foreground" /></AvatarFallback></Avatar><div className="min-w-0 flex-1"><Badge variant="secondary" className="mb-2">{t("Empresa")}</Badge><Link href={`/empresa/${encodeURIComponent(empresa.slug)}`} className="block text-lg font-semibold hover:underline">{empresa.nombre}</Link></div></div>
      {empresa.estadoVerificacion === "verificada" && <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><BadgeCheck className="size-3.5" />{t("Empresa verificada")}</p>}
      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{empresa.descripcion}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="size-3.5" />{empresa.ubicacion}</span>{rating !== null && <span className="flex items-center gap-1"><Star className="size-4 fill-amber-500 text-amber-500" /><strong className="text-foreground">{rating.toFixed(1)}</strong>({resenas.length})</span>}</div>
      <div className="flex flex-wrap gap-2">{empresa.servicios.slice(0, 3).map((servicio) => <Badge key={servicio} variant="secondary" className="max-w-full whitespace-normal">{servicio}</Badge>)}</div>
    </CardContent>
    <CardFooter className="mt-auto border-t pt-4"><Button asChild variant="outline" className="w-full bg-transparent"><Link href={`/empresa/${encodeURIComponent(empresa.slug)}`}>{t("Ver perfil")}<ArrowRight className="size-4" /></Link></Button></CardFooter>
  </Card>
}
