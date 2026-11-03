"use client"

import { useT } from "@/components/idioma-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { DatosLegalesEmpresa } from "@/lib/perfil-profesional-editor"

export function DatosLegalesEmpresaCard({ datos, editando = false, onDomicilioChange }: {
  datos: DatosLegalesEmpresa
  editando?: boolean
  onDomicilioChange?: (domicilio: string) => void
}) {
  const t = useT()
  return <Card>
    <CardHeader><CardTitle className="text-lg">{t("Datos de la empresa")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-sm font-medium">{t("Razón social")}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{datos.razonSocial || t("No especificado")}</dd></div>
        <div className="min-w-0"><dt className="text-sm font-medium">{t("CIF")}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{datos.cif || t("No especificado")}</dd></div>
      </dl>
      <div className="space-y-1">
        {editando && onDomicilioChange ? <>
          <Label htmlFor="empresa-domicilio">{t("Domicilio")}</Label>
          <Textarea id="empresa-domicilio" rows={2} maxLength={500} value={datos.domicilio}
            placeholder={t("Calle, número, código postal y localidad")}
            onChange={(event) => onDomicilioChange(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("Este domicilio se mostrará en el perfil público de tu empresa.")}</p>
        </> : <dl><dt className="text-sm font-medium">{t("Domicilio")}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{datos.domicilio || t("No especificado")}</dd></dl>}
      </div>
    </CardContent>
  </Card>
}
