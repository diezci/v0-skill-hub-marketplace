"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { BotonesOAuth } from "@/components/botones-oauth"

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
  // DNI/NIE de la persona que actúa en nombre de la empresa (en un particular
  // ese dato ya es `documento`).
  const [documentoPersonal, setDocumentoPersonal] = useState("")
  const [cargoEmpresa, setCargoEmpresa] = useState("")
  const [telefonoPrefijo, setTelefonoPrefijo] = useState("+34")
  const [telefonoNumero, setTelefonoNumero] = useState("")
  const [ubicacion, setUbicacion] = useState("")
  const [tokenInvitacion, setTokenInvitacion] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  // /convertirse-profesional manda aquí a quien aún no tiene cuenta: primero el
  // registro normal y después el perfil profesional. Se lee de la URL sin
  // useSearchParams para no forzar una frontera de Suspense en esta página.
  const [quiereSerProfesional, setQuiereSerProfesional] = useState(false)
  useEffect(() => {
    setQuiereSerProfesional(new URLSearchParams(window.location.search).get("siguiente") === "profesional")
  }, [])

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

    // Detrás de una empresa siempre hay una persona que responde de lo que hace
    // en la plataforma: su documento es obligatorio.
    if (tipoEntidad === "empresa" && !documentoPersonal.trim()) {
      setError("Indica tu DNI/NIE como persona que actúa en nombre de la empresa")
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
        documentoPersonal: tipoEntidad === "empresa" ? documentoPersonal : undefined,
        cargoEmpresa: tipoEntidad === "empresa" ? cargoEmpresa || undefined : undefined,
        nombreEmpresa: tipoEntidad === "empresa" ? nombreEmpresa : undefined,
        tokenInvitacion: tokenInvitacion || undefined,
        telefono,
        ubicacion,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      // Si venía de "quiero ser profesional", se arrastra la intención para
      // invitarle a completar su perfil profesional nada más registrarse.
      router.push(quiereSerProfesional ? "/auth/registro-exitoso?siguiente=profesional" : "/auth/registro-exitoso")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al crear la cuenta")
    } finally {
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
                <BotonesOAuth cargando={isLoading} onCargando={setIsLoading} onError={(m) => setError(m || null)} />

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">O regístrate con email</span>
                  </div>
                </div>

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

                {/* Detrás de una empresa siempre actúa una persona: se identifica
                    aquí, y es la que figurará como representante en las facturas. */}
                {tipoEntidad === "empresa" && (
                  <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                    <Label htmlFor="documento-personal">Tu DNI/NIE (persona que actúa por la empresa)</Label>
                    <Input
                      id="documento-personal"
                      type="text"
                      placeholder="12345678X"
                      required
                      value={documentoPersonal}
                      onChange={(e) => setDocumentoPersonal(e.target.value.toUpperCase())}
                    />
                    <Label htmlFor="cargo-empresa" className="mt-1">
                      Tu cargo (opcional)
                    </Label>
                    <Input
                      id="cargo-empresa"
                      type="text"
                      placeholder="Administrador, Gerente..."
                      value={cargoEmpresa}
                      onChange={(e) => setCargoEmpresa(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      La empresa factura y contrata, pero necesitamos saber quién actúa en su nombre.
                    </p>
                  </div>
                )}

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
