"use client"

import { useT } from "@/components/idioma-provider"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Lock, AlertCircle, CheckCircle2 } from "lucide-react"

type Comprobacion = { estado: "comprobando" | "invalido" | "sinConexion" } | { estado: "listo"; usuarioId: string }

function errorTemporal(error: unknown) {
  const authError = error as { name?: string; status?: number }
  return error instanceof TypeError || authError?.name === "AuthRetryableFetchError" || (authError?.status ?? 0) >= 500
}

function enlaceConError() {
  const url = new URL(window.location.href)
  const fragmento = new URLSearchParams(url.hash.slice(1))
  return ["error", "error_code", "error_description"].some((clave) => url.searchParams.has(clave) || fragmento.has(clave))
}

export default function ActualizarContrasenaPage() {
  const t = useT()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const [comprobacion, setComprobacion] = useState<Comprobacion>({ estado: "comprobando" })

  useEffect(() => {
    let cancelado = false
    const guardar = (resultado: Comprobacion) => { if (!cancelado) setComprobacion(resultado) }
    guardar({ estado: "comprobando" })
    async function comprobar() {
      // An invalid link must never fall back to an unrelated existing session.
      if (enlaceConError()) { guardar({ estado: "invalido" }); return }
      try {
        const { auth } = createClient()
        const inicializacion = await auth.initialize()
        if (inicializacion.error) {
          guardar({ estado: errorTemporal(inicializacion.error) ? "sinConexion" : "invalido" })
          return
        }
        // A successful PKCE exchange removes code. Without the originating
        // verifier the SDK keeps it and may retain a previous browser session.
        if (enlaceConError() || new URL(window.location.href).searchParams.has("code")) {
          guardar({ estado: "invalido" }); return
        }
        const { data, error } = await auth.getUser()
        if (error) { guardar({ estado: errorTemporal(error) ? "sinConexion" : "invalido" }); return }
        guardar(data.user ? { estado: "listo", usuarioId: data.user.id } : { estado: "invalido" })
      } catch (error) {
        guardar({ estado: errorTemporal(error) ? "sinConexion" : "invalido" })
      }
    }
    void comprobar()
    return () => { cancelado = true }
  }, [])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (comprobacion.estado !== "listo" || enlaceConError()) return
    setIsLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      setIsLoading(false)
      return
    }

    const supabase = createClient()

    try {
      // Revalidate immediately before changing credentials, including account
      // changes in another tab while the form was open.
      const identidad = await supabase.auth.getUser()
      if (identidad.error) throw identidad.error
      if (!identidad.data.user || identidad.data.user.id !== comprobacion.usuarioId) {
        setComprobacion({ estado: "invalido" })
        return
      }
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      setSuccess(true)

      setTimeout(() => {
        router.push("/auth/login")
      }, 2000)
    } catch (error: unknown) {
      const authError = error as { name?: string; code?: string; status?: number }
      if (authError?.name === "AuthSessionMissingError" || authError?.status === 401 || authError?.status === 403) {
        setComprobacion({ estado: "invalido" })
      } else if (errorTemporal(error)) {
        setError("No se ha podido conectar. Conservamos tus datos; vuelve a intentarlo.")
      } else if (authError?.code === "same_password") {
        setError("La nueva contraseña debe ser distinta de la anterior")
      } else {
        setError("No se ha podido actualizar la contraseña. Vuelve a intentarlo.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">{t("Nueva Contraseña")}</CardTitle>
            <CardDescription className="text-base">{t("Ingresa tu nueva contraseña")}</CardDescription>
          </CardHeader>
          <CardContent>
            {comprobacion.estado === "comprobando" ? (
              <p role="status" className="text-center text-sm text-muted-foreground">{t("Comprobando enlace de recuperación...")}</p>
            ) : comprobacion.estado === "invalido" || comprobacion.estado === "sinConexion" ? (
              <div className="space-y-4" data-recuperacion-invalida>
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <p>{t(comprobacion.estado === "invalido"
                    ? "El enlace no es válido, ha caducado o ya se ha utilizado. Solicita un nuevo enlace y ábrelo en el mismo navegador desde el que lo pediste."
                    : "No se ha podido comprobar el enlace por un problema de conexión. Vuelve a intentarlo.")}</p>
                </div>
                {comprobacion.estado === "sinConexion" && (
                  <Button className="w-full" onClick={() => window.location.reload()}>{t("Reintentar")}</Button>
                )}
                <Button asChild className="w-full"><Link href="/auth/recuperar-contrasena">{t("Solicitar nuevo enlace")}</Link></Button>
                <Link href="/auth/login" className="block text-center text-sm text-primary underline">{t("Volver al inicio de sesión")}</Link>
              </div>
            ) : !success ? (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    {t("Nueva Contraseña")}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <PasswordInput
                      id="password"
                      autoComplete="new-password"
                      className="pl-10"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("Mínimo 6 caracteres")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    {t("Confirmar Contraseña")}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <PasswordInput
                      id="confirmPassword"
                      autoComplete="new-password"
                      className="pl-10"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("Repite tu contraseña")}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{t(error)}</span>
                  </div>
                )}

                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? t("Actualizando...") : t("Actualizar Contraseña")}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{t("¡Contraseña actualizada!")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("Tu contraseña ha sido actualizada exitosamente. Serás redirigido al inicio de sesión...")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
