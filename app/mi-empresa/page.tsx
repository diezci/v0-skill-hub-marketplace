"use client"

import { useEffect, useState } from "react"
import type { RegistroEmpresa } from "@/app/actions/empresas"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Copy, Users, Building2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"

export default function MiEmpresaPage() {
  const [empresa, setEmpresa] = useState<any>(null)
  const [miembros, setMiembros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sinSesion, setSinSesion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registro, setRegistro] = useState<RegistroEmpresa>({ documentoPersonal: "" })

  useEffect(() => {
    async function cargarDatos() {
      const { obtenerEmpresa, obtenerMiembrosEmpresa } = await import("@/app/actions/auth")

      const { obtenerRegistroEmpresaPendiente } = await import("@/app/actions/empresas")
      const [empresaResult, miembrosResult, registroResult] = await Promise.all([
        obtenerEmpresa(), obtenerMiembrosEmpresa(), obtenerRegistroEmpresaPendiente(),
      ])
      if (registroResult.error) setSinSesion(true)
      const token = new URLSearchParams(window.location.search).get("token")?.trim()
      setRegistro({ documentoPersonal: "", ...registroResult.data, ...(token ? { tokenInvitacion: token } : {}) })

      if (empresaResult.data) {
        setEmpresa(empresaResult.data)
      }

      if (miembrosResult.data) {
        setMiembros(miembrosResult.data)
      }

      setLoading(false)
    }

    void cargarDatos().catch(() => {
      setError("No se pudieron cargar los datos de tu empresa. Actualiza la página para volver a intentarlo.")
      setLoading(false)
    })
  }, [])

  const copiarLinkInvitacion = () => {
    if (!empresa?.token_invitacion) return

    const invitacionUrl = `${window.location.origin}/auth/registro?token=${empresa.token_invitacion}`
    navigator.clipboard.writeText(invitacionUrl)

    toast({
      title: "Link copiado",
      description: "El link de invitación se ha copiado al portapapeles",
    })
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!empresa) {
    const actualizar = (campo: keyof RegistroEmpresa, valor: string) =>
      setRegistro((actual) => ({ ...actual, [campo]: valor }))
    const guardar = async (event: React.FormEvent) => {
      event.preventDefault()
      setGuardando(true)
      setError(null)
      try {
        const { completarRegistroEmpresa } = await import("@/app/actions/empresas")
        const resultado = await completarRegistroEmpresa(registro)
        if (resultado.error) { setError(resultado.error); return }
        window.location.reload()
      } catch {
        setError("No se pudo guardar la empresa. Puedes volver a intentarlo.")
      } finally { setGuardando(false) }
    }
    return (
      <div className="container mx-auto max-w-xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Completar Mi Empresa</CardTitle>
            <CardDescription>
              {sinSesion
                ? "Tu cuenta personal y tu empresa se completan en dos pasos. Confirma tu correo e inicia sesión para continuar."
                : "Crea tu empresa o utiliza una invitación. Tu cuenta podrá contratar y ofrecer servicios en su nombre."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sinSesion ? (
              <Button asChild><Link href={`/auth/login?next=${encodeURIComponent(registro.tokenInvitacion ? `/mi-empresa?token=${encodeURIComponent(registro.tokenInvitacion)}` : "/mi-empresa")}`}>Iniciar sesión para continuar</Link></Button>
            ) : (
              <form onSubmit={guardar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="empresa-token">Token de invitación (si te invitaron)</Label>
                  <Input id="empresa-token" value={registro.tokenInvitacion || ""} onChange={(e) => actualizar("tokenInvitacion", e.target.value)} />
                </div>
                {!registro.tokenInvitacion?.trim() && <>
                  <div className="space-y-2">
                    <Label htmlFor="empresa-nombre">Nombre de la empresa</Label>
                    <Input id="empresa-nombre" required value={registro.nombreEmpresa || ""} onChange={(e) => actualizar("nombreEmpresa", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empresa-cif">CIF</Label>
                    <Input id="empresa-cif" required value={registro.cif || ""} onChange={(e) => actualizar("cif", e.target.value.toUpperCase())} />
                  </div>
                </>}
                <div className="space-y-2">
                  <Label htmlFor="empresa-dni">Tu DNI/NIE como representante</Label>
                  <Input id="empresa-dni" required value={registro.documentoPersonal} onChange={(e) => actualizar("documentoPersonal", e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa-cargo">Tu cargo (opcional)</Label>
                  <Input id="empresa-cargo" value={registro.cargoEmpresa || ""} onChange={(e) => actualizar("cargoEmpresa", e.target.value)} />
                </div>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={guardando}>{guardando ? "Guardando..." : "Vincular mi empresa"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const invitacionUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/registro?token=${empresa.token_invitacion}`

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col gap-8 max-w-4xl">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{empresa.nombre}</h1>
            <p className="text-muted-foreground">CIF: {empresa.cif}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tu cuenta ya representa a esta empresa</CardTitle>
            <CardDescription>Puedes contratar servicios y completar tu perfil profesional para ofrecerlos en su nombre.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild><Link href="/mi-perfil?completar=profesional">Completar perfil profesional</Link></Button>
            <Button variant="outline" asChild><Link href="/">Publicar una demanda</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Invitar Empleados
            </CardTitle>
            <CardDescription>Comparte este link con tus empleados para que se unan a la empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invitation-link">Link de Invitación</Label>
              <div className="flex gap-2">
                <Input id="invitation-link" value={invitacionUrl} readOnly className="font-mono text-sm" />
                <Button onClick={copiarLinkInvitacion} size="icon" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Los empleados completarán la invitación desde Mi Empresa después de confirmar su correo.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Miembros de la Empresa ({miembros.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {miembros.map((miembro) => (
                <div key={miembro.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {miembro.nombre[0]}
                    {miembro.apellido?.[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {miembro.nombre} {miembro.apellido}
                    </p>
                    <p className="text-sm text-muted-foreground">{miembro.email}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(miembro.fecha_registro).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
