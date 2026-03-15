"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

const GOOGLE_OAUTH_ENABLED = true

const provincias = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila",
  "Badajoz", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria",
  "Castellón", "Ceuta", "Ciudad Real", "Córdoba", "Cuenca", "Girona",
  "Granada", "Guadalajara", "Guipúzcoa", "Huelva", "Huesca", "Islas Baleares",
  "Jaén", "La Coruña", "La Rioja", "Las Palmas", "León", "Lleida",
  "Lugo", "Madrid", "Málaga", "Melilla", "Murcia", "Navarra",
  "Ourense", "Palencia", "Pontevedra", "Santa Cruz de Tenerife", "Segovia",
  "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia",
  "Valladolid", "Vizcaya", "Zamora", "Zaragoza",
]

const prefijosPais = [
  { pais: "España", prefijo: "+34" },
  { pais: "Francia", prefijo: "+33" },
  { pais: "Portugal", prefijo: "+351" },
  { pais: "Reino Unido", prefijo: "+44" },
  { pais: "Alemania", prefijo: "+49" },
  { pais: "Italia", prefijo: "+39" },
  { pais: "Estados Unidos", prefijo: "+1" },
  { pais: "México", prefijo: "+52" },
  { pais: "Argentina", prefijo: "+54" },
  { pais: "Colombia", prefijo: "+57" },
  { pais: "Chile", prefijo: "+56" },
  { pais: "Perú", prefijo: "+51" },
  { pais: "Brasil", prefijo: "+55" },
  { pais: "Uruguay", prefijo: "+598" },
]

export default function RegistroPage() {
  const [nombre, setNombre] = useState("")
  const [apellido, setApellido] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [tipoEntidad, setTipoEntidad] = useState<"particular" | "empresa">("particular")
  const [documento, setDocumento] = useState("")
  const [nombreEmpresa, setNombreEmpresa] = useState("")
  const [telefonoPrefijo, setTelefonoPrefijo] = useState("+34")
  const [telefonoNumero, setTelefonoNumero] = useState("")
  const [ubicacion, setUbicacion] = useState("")
  const [tokenInvitacion, setTokenInvitacion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError("Las contraseñas no coinciden")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      setIsLoading(false)
      return
    }

    if (!documento.trim()) {
      setError(`Por favor ingresa tu ${tipoEntidad === "empresa" ? "CIF" : "DNI"}`)
      setIsLoading(false)
      return
    }

    if (tipoEntidad === "empresa" && !tokenInvitacion && !nombreEmpresa.trim()) {
      setError("Por favor ingresa el nombre de tu empresa")
      setIsLoading(false)
      return
    }

    try {
      const { registrarUsuario } = await import("@/app/actions/auth")

      const telefono = telefonoNumero ? `${telefonoPrefijo} ${telefonoNumero}` : ""

      const result = await registrarUsuario({
        email,
        password,
        nombre,
        apellido,
        tipoEntidad,
        documento,
        nombreEmpresa: tipoEntidad === "empresa" ? nombreEmpresa : undefined,
        tokenInvitacion: tokenInvitacion || undefined,
        telefono,
        ubicacion,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      router.push("/auth/registro-exitoso")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al crear la cuenta")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })

      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al registrarse con Google")
      setIsLoading(false)
    }
  }

  return (
    <div 
      className="flex min-h-screen w-full items-center justify-center p-6 relative"
      style={{
        backgroundImage: "url('/background-working-gray.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-black/40"></div>
      <div className="w-full max-w-md z-10">
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Crear Cuenta</CardTitle>
            <CardDescription>Regístrate para contratar u ofrecer servicios profesionales</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp}>
              <div className="flex flex-col gap-4">
                {GOOGLE_OAUTH_ENABLED && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 bg-transparent"
                      onClick={handleGoogleSignUp}
                      disabled={isLoading}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      Continuar con Google
                    </Button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <Separator />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">O regístrate con email</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="nombre">Nombre</Label>
                    <Input
                      id="nombre"
                      type="text"
                      placeholder="Juan"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apellido">Apellidos</Label>
                    <Input
                      id="apellido"
                      type="text"
                      placeholder="Pérez García"
                      required
                      value={apellido}
                      onChange={(e) => setApellido(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tipo-entidad">Tipo de Registro</Label>
                  <Select value={tipoEntidad} onValueChange={(val) => setTipoEntidad(val as "particular" | "empresa")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="empresa">Empresa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {tipoEntidad === "empresa" && !tokenInvitacion && (
                  <div className="grid gap-2">
                    <Label htmlFor="nombre-empresa">Nombre de la Empresa</Label>
                    <Input
                      id="nombre-empresa"
                      type="text"
                      placeholder="Mi Empresa S.L."
                      required
                      value={nombreEmpresa}
                      onChange={(e) => setNombreEmpresa(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="documento">{tipoEntidad === "empresa" ? "CIF" : "DNI/NIE"}</Label>
                  <Input
                    id="documento"
                    type="text"
                    placeholder={tipoEntidad === "empresa" ? "A12345678" : "12345678X"}
                    required
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value.toUpperCase())}
                  />
                  <p className="text-xs text-muted-foreground">
                    {tipoEntidad === "empresa"
                      ? "Código de Identificación Fiscal de tu empresa"
                      : "Documento Nacional de Identidad o NIE"}
                  </p>
                </div>

                {tipoEntidad === "empresa" && (
                  <div className="grid gap-2">
                    <Label htmlFor="token-invitacion">Token de Invitación (opcional)</Label>
                    <Input
                      id="token-invitacion"
                      type="text"
                      placeholder="Si te invitaron a una empresa..."
                      value={tokenInvitacion}
                      onChange={(e) => setTokenInvitacion(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Si tienes un token de invitación, tu cuenta se unirá automáticamente a la empresa
                    </p>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Teléfono (opcional)</Label>
                  <div className="flex gap-2">
                    <Select value={telefonoPrefijo} onValueChange={setTelefonoPrefijo}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {prefijosPais.map((p) => (
                          <SelectItem key={p.prefijo + p.pais} value={p.prefijo}>
                            {p.prefijo} {p.pais}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="tel"
                      placeholder="600 000 000"
                      className="flex-1"
                      value={telefonoNumero}
                      onChange={(e) => setTelefonoNumero(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ubicacion">Provincia</Label>
                  <Select value={ubicacion} onValueChange={setUbicacion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tu provincia" />
                    </SelectTrigger>
                    <SelectContent>
                      {provincias.map((prov) => (
                        <SelectItem key={prov} value={prov}>
                          {prov}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="repeat-password">Repetir Contraseña</Label>
                  <Input
                    id="repeat-password"
                    type="password"
                    placeholder="Repite tu contraseña"
                    required
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md">{error}</div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creando cuenta..." : "Crear Cuenta"}
                </Button>
              </div>

              <div className="mt-4 text-center text-sm">
                ¿Ya tienes cuenta?{" "}
                <Link href="/auth/login" className="underline underline-offset-4 hover:text-primary">
                  Inicia sesión
                </Link>
              </div>

              <div className="mt-2 text-center text-xs text-muted-foreground">
                Al registrarte, podrás contratar servicios y más adelante crear tu perfil profesional para ofrecer
                servicios.
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
