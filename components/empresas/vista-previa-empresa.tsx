"use client"

import Link from "next/link"
import { ArrowLeft, Eye, Pencil } from "lucide-react"
import PerfilEmpresa from "@/components/empresas/perfil-empresa"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import type { EmpresaPublica } from "@/lib/empresas/types"

export function VistaPreviaEmpresa({ datos, puedeEditar = false }: { datos: EmpresaPublica; puedeEditar?: boolean }) {
  const t = useT()
  const publicada = datos.empresa.estadoVerificacion === "verificada"

  return <>
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:pt-8">
      <aside aria-label={t("Vista previa privada")} className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><Eye className="size-4 shrink-0" />{t("Vista previa privada")}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{t(publicada ? "Así se muestra tu perfil publicado. Esta vista previa solo está disponible para las personas autorizadas de tu empresa." : "Tu empresa todavía no es pública. Aquí puedes revisar cómo se mostrará su perfil cuando esté verificada.")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("Esta vista muestra los cambios guardados. Guarda la edición antes de actualizarla.")}</p>
          <p id="empresa-vista-previa-contacto" className="text-xs leading-relaxed text-muted-foreground">{t("Los botones de contacto están desactivados en esta vista previa.")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {puedeEditar && <Button asChild size="sm"><Link href="/mi-empresa#perfil-empresa"><Pencil className="size-4" aria-hidden="true" />{t("Editar perfil de empresa")}</Link></Button>}
          <Button asChild variant="outline" size="sm"><Link href="/mi-empresa"><ArrowLeft className="size-4" aria-hidden="true" />{t("Volver a Mi empresa")}</Link></Button>
        </div>
      </aside>
    </div>
    <PerfilEmpresa datos={datos} vistaPrevia />
  </>
}
