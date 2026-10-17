"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
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
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string; estado_verificacion: string } | null>(null)
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let vigente = true
    setCargando(true)
    obtenerContextoEmpresa().then((result) => {
      if (!vigente) return
      setEmpresa(result.data)
      setError(result.error || "")
    }).catch(() => { if (vigente) setError("No se pudo cargar tu empresa. Vuelve a intentarlo.") })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [revision])
  if (cargando) return value ? <p role="status" className="text-sm text-muted-foreground">{t("Comprobando la empresa seleccionada…")}</p> : null
  if (error) return <div role="status" className="text-sm text-muted-foreground">{t(error)} <Button type="button" variant="link" onClick={() => setRevision((r) => r + 1)}>{t("Reintentar")}</Button></div>
  if (empresa && empresa.estado_verificacion !== "verificada") return <div role="status" className="space-y-2 rounded-lg border p-3 text-sm">
    <p>{t("Acredita la empresa antes de iniciar nuevas operaciones en su nombre.")}</p>
    <Button asChild variant="link" className="h-auto p-0"><Link href="/mi-empresa">{t("Revisar acreditación")}</Link></Button>
    {value && <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(null)}>{t("Usar mi perfil personal")}</Button>}
  </div>
  if (!empresa) return value ? <div role="alert" className="space-y-2 rounded-lg border p-3 text-sm">
    <p>{t("La empresa seleccionada ya no está disponible. Puedes continuar con tu perfil personal.")}</p>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(null)}>{t("Usar mi perfil personal")}</Button>
  </div> : null
  return <div className="space-y-2 rounded-lg border p-3">
    {value && value !== empresa.id && <p role="alert" className="text-sm">{t("La empresa del borrador ya no está disponible. Selecciona con qué perfil continuar.")}</p>}
    <Label htmlFor={id}>{t("Actuar como")}</Label>
    <Select value={value || "personal"} onValueChange={(valor) => onChange(valor === "personal" ? null : valor)} disabled={disabled}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="personal">{t("Mi perfil personal")}</SelectItem><SelectItem value={empresa.id}>{empresa.nombre}</SelectItem></SelectContent>
    </Select>
    {value && <p className="text-xs text-muted-foreground">{t("La operación quedará a nombre de la empresa y se registrará que la has realizado tú.")}</p>}
  </div>
}
