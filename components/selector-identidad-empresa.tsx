"use client"

import { useEffect, useId, useState } from "react"
import { obtenerContextoEmpresa } from "@/app/actions/empresa-contexto"
import { useT } from "@/components/idioma-provider"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function SelectorIdentidadEmpresa({ value, onChange, disabled = false }: {
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const t = useT()
  const id = useId()
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string } | null>(null)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let vigente = true
    obtenerContextoEmpresa().then((result) => {
      if (!vigente) return
      setEmpresa(result.data)
      setError(result.error || "")
    }).catch(() => { if (vigente) setError("No se pudo cargar tu empresa. Vuelve a intentarlo.") })
    return () => { vigente = false }
  }, [revision])
  if (error) return <div role="status" className="text-sm text-muted-foreground">{t(error)} <Button type="button" variant="link" onClick={() => setRevision((r) => r + 1)}>{t("Reintentar")}</Button></div>
  if (!empresa) return null
  return <div className="space-y-2 rounded-lg border p-3">
    <Label htmlFor={id}>{t("Actuar como")}</Label>
    <Select value={value || "personal"} onValueChange={(valor) => onChange(valor === "personal" ? null : valor)} disabled={disabled}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="personal">{t("Mi perfil personal")}</SelectItem><SelectItem value={empresa.id}>{empresa.nombre}</SelectItem></SelectContent>
    </Select>
    {value && <p className="text-xs text-muted-foreground">{t("La operación quedará a nombre de la empresa y se registrará que la has realizado tú.")}</p>}
  </div>
}
