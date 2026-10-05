"use client"

import { useT } from "@/components/idioma-provider"
import { Checkbox } from "@/components/ui/checkbox"
import { PERMISOS_EMPRESA, type PermisosEmpresa } from "@/lib/empresas/types"

export function PermisosEmpresaFields({ permisos, onChange, limites, disabled = false }: {
  permisos: PermisosEmpresa
  onChange: (permisos: PermisosEmpresa) => void
  limites?: PermisosEmpresa
  disabled?: boolean
}) {
  const t = useT()
  return <div className="divide-y rounded-xl border px-3 sm:px-4">
    {PERMISOS_EMPRESA.map(({ clave, titulo, descripcion }) => <label key={clave} className="flex items-start gap-3 py-3">
      <Checkbox className="mt-0.5" checked={permisos[clave]} disabled={disabled || (!!limites && !limites[clave])} onCheckedChange={(checked) => {
        const siguiente = { ...permisos, [clave]: checked === true }
        if (clave === "gestionar_cobros" && checked === true) siguiente.ver_cobros = true
        if (clave === "ver_cobros" && checked !== true) siguiente.gestionar_cobros = false
        onChange(siguiente)
      }} />
      <span className="min-w-0"><span className="block text-sm font-medium">{t(titulo)}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(descripcion)}{clave === "presupuestos" && <> {t("Requiere perfil profesional para enviar ofertas.")}</>}</span></span>
    </label>)}
  </div>
}
