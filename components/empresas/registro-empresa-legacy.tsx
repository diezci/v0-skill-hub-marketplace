"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { completarRegistroEmpresa, obtenerRegistroEmpresaPendiente, type RegistroEmpresa } from "@/app/actions/empresas"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** Only company creation. Joining an existing company always uses an individual invitation. */
export default function RegistroEmpresaLegacy() {
  const t = useT()
  const router = useRouter()
  const [registro, setRegistro] = useState<RegistroEmpresa>({ documentoPersonal: "" })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelado = false
    obtenerRegistroEmpresaPendiente().then((result) => {
      if (!cancelado && result.data) {
        const { tokenInvitacion: _token, ...datos } = result.data
        setRegistro({ ...datos, documentoPersonal: datos.documentoPersonal || "" })
      }
    }).catch(() => { if (!cancelado) setError("No se pudieron cargar los datos de tu empresa. Actualiza la página para volver a intentarlo.") }).finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [])
  const actualizar = (campo: keyof RegistroEmpresa, valor: string) => setRegistro((r) => ({ ...r, [campo]: valor }))
  async function guardar(event: FormEvent) {
    event.preventDefault(); setGuardando(true); setError("")
    try {
      const { tokenInvitacion: _token, ...datos } = registro
      const result = await completarRegistroEmpresa(datos)
      if (result.error) { setError(result.error); return }
      router.refresh()
    } catch { setError("No se pudo guardar la empresa. Puedes volver a intentarlo.") }
    finally { setGuardando(false) }
  }
  return <div className="container mx-auto max-w-xl px-4 py-8"><Card><CardHeader><CardTitle>{t("Crear mi empresa")}</CardTitle><CardDescription>{t("Gestionarás la cuenta como responsable principal. Después podrás completar el perfil, acreditar la representación e invitar al equipo.")}</CardDescription></CardHeader><CardContent>
    <form onSubmit={guardar} className="space-y-4"><fieldset disabled={guardando || cargando} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="empresa-nombre">{t("Nombre de la empresa")}</Label><Input id="empresa-nombre" required maxLength={120} value={registro.nombreEmpresa || ""} onChange={(e) => actualizar("nombreEmpresa", e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="empresa-cif">{t("CIF")}</Label><Input id="empresa-cif" required value={registro.cif || ""} onChange={(e) => actualizar("cif", e.target.value.toUpperCase())} /></div>
      <div className="space-y-2"><Label htmlFor="empresa-documento">{t("Tu DNI/NIE como responsable de la cuenta")}</Label><Input id="empresa-documento" required value={registro.documentoPersonal} onChange={(e) => actualizar("documentoPersonal", e.target.value.toUpperCase())} /></div>
      <div className="space-y-2"><Label htmlFor="empresa-cargo">{t("Cargo en la empresa")}</Label><Input id="empresa-cargo" required minLength={2} maxLength={120} value={registro.cargoEmpresa || ""} onChange={(e) => actualizar("cargoEmpresa", e.target.value)} /></div>
    </fieldset><p className="text-xs leading-relaxed text-muted-foreground">{t("Crear la cuenta no acredita la representación legal. El perfil se publicará cuando Diime complete la revisión.")}</p>{error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}<Button type="submit" disabled={guardando || cargando}>{t(guardando ? "Guardando..." : "Crear empresa")}</Button></form>
    <p className="mt-5 text-sm text-muted-foreground">{t("Si has recibido una invitación, abre su enlace desde la cuenta a la que está dirigida.")}</p>
  </CardContent></Card></div>
}
