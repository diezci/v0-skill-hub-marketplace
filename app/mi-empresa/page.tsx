"use client"

import { useEffect, useState } from "react"
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

  useEffect(() => {
    async function cargarDatos() {
      const { obtenerEmpresa, obtenerMiembrosEmpresa } = await import("@/app/actions/auth")

      const [empresaResult, miembrosResult] = await Promise.all([obtenerEmpresa(), obtenerMiembrosEmpresa()])

      if (empresaResult.data) {
        setEmpresa(empresaResult.data)
      }

      if (miembrosResult.data) {
        setMiembros(miembrosResult.data)
      }

      setLoading(false)
    }

    cargarDatos()
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
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>No perteneces a ninguna empresa</CardTitle>
            <CardDescription>Regístrate como empresa para acceder a esta funcionalidad</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth/registro">
              <Button>Registrar Empresa</Button>
            </Link>
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
                Los empleados que se registren con este link se unirán automáticamente a tu empresa
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
