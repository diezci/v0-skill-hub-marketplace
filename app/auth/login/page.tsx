"use client"

import { useT } from "@/components/idioma-provider"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Mail, Lock, AlertCircle } from "lucide-react"
import { destinoAuthSeguro, destinoTrasConfirmacion } from "@/lib/auth-redirect"
import { BotonesOAuth } from "@/components/botones-oauth"

export default function LoginPage() {
  const t = useT()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [correoPendiente, setCorreoPendiente] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [correoReenviado, setCorreoReenviado] = useState(false)
  const [desdeConfirmacion, setDesdeConfirmacion] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const router = useRouter()
  const [siguiente, setSiguiente] = useState("")
  const [oauthCancelado, setOauthCancelado] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setSiguiente(destinoAuthSeguro(params.get("next"), ""))
    setDesdeConfirmacion(params.get("confirmacion") === "1")
    setOauthCancelado(params.get("oauth") === "cancelled")
  }, [])

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email) {
      setEmailError("El email es requerido")
      return false
    }
    if (!emailRegex.test(email)) {
      setEmailError("Email inválido")
      return false
    }
    setEmailError(null)
    return true
  }

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError("La contraseña es requerida")
      return false
    }
    if (password.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres")
      return false
    }
    setPasswordError(null)
    return true
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    const isEmailValid = validateEmail(email)
    const isPasswordValid = validatePassword(password)

    if (!isEmailValid || !isPasswordValid) {
      return
    }

    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setCorreoPendiente(false)
    setCorreoReenviado(false)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      const params = new URLSearchParams(window.location.search)
      const requested = params.get("next")
      const destination = params.get("confirmacion") === "1"
        ? destinoTrasConfirmacion(requested, data.user?.user_metadata?.registro_next)
        : destinoAuthSeguro(requested)
      router.push(destination)
      router.refresh()
    } catch (error: unknown) {
      const pendiente = typeof error === "object" && error !== null && "code" in error && error.code === "email_not_confirmed"
      setCorreoPendiente(pendiente)
      setError(pendiente ? "Tu correo todavía no está confirmado. Revisa el mensaje de confirmación o solicita otro enlace." : error instanceof Error ? t(error.message) : "Error al iniciar sesión")
    } finally {
      setIsLoading(false)
    }
  }

  const reenviarConfirmacion = async () => {
    if (reenviando || !correoPendiente) return
    setReenviando(true)
    setCorreoReenviado(false)
    setError(null)
    try {
      // This SDK's resend uses an implicit confirmation link, not a PKCE code.
      // Confirm the email, then ask for the existing password before resuming.
      const callback = new URL("/auth/login", window.location.origin)
      callback.searchParams.set("confirmacion", "1")
      const destino = destinoAuthSeguro(new URLSearchParams(window.location.search).get("next"), "")
      if (destino) callback.searchParams.set("next", destino)
      const { error } = await createClient().auth.resend({
        type: "signup", email: email.trim(), options: { emailRedirectTo: callback.toString() },
      })
      if (error) throw error
      setCorreoReenviado(true)
    } catch {
      setError("No se pudo reenviar el correo. Inténtalo de nuevo en unos momentos.")
    } finally {
      setReenviando(false)
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true"></div>
      <div className="w-full max-w-md z-10">
        <Card className="shadow-2xl border-0 backdrop-blur-md bg-card/95">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">{t("Bienvenido")}</CardTitle>
            <CardDescription className="text-base">{t("Inicia sesión para acceder a tu cuenta")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {oauthCancelado && <p role="status" className="text-sm text-muted-foreground">{t("Has cancelado el inicio de sesión. Puedes intentarlo de nuevo o usar tu email.")}</p>}
            {desdeConfirmacion && <p role="status" className="text-sm text-muted-foreground">{t("Entra con tu contraseña para continuar con el registro.")}</p>}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  {t("Email")}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("tu@email.com")}
                    className={`pl-10 ${emailError ? "border-red-500" : ""}`}
                    value={email}
                    disabled={isLoading || reenviando}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setCorreoPendiente(false)
                      setCorreoReenviado(false)
                      setError(null)
                      if (emailError) validateEmail(e.target.value)
                    }}
                    onBlur={() => validateEmail(email)}
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {t(emailError)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    {t("Contraseña")}
                  </Label>
                  <Link href="/auth/recuperar-contrasena" className="text-xs text-primary hover:underline">
                    {t("¿Olvidaste tu contraseña?")}
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    className={`pl-10 ${passwordError ? "border-red-500" : ""}`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) validatePassword(e.target.value)
                    }}
                    onBlur={() => validatePassword(password)}
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {t(passwordError)}
                  </p>
                )}
              </div>

              {error && (
                <div role="alert" className="text-sm text-red-500 bg-red-50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{t(error)}</span>
                </div>
              )}

              {correoPendiente && (
                <div className="space-y-2">
                  <Button type="button" variant="outline" className="w-full" disabled={isLoading || reenviando} onClick={reenviarConfirmacion}>
                    {reenviando ? t("Reenviando...") : t("Reenviar correo de confirmación")}
                  </Button>
                  {correoReenviado && <p role="status" className="text-sm text-emerald-700">{t("Hemos enviado otro enlace de confirmación. Revisa tu correo para continuar.")}</p>}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={isLoading || reenviando}>
                {isLoading ? t("Iniciando sesión...") : t("Iniciar Sesión")}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("O continúa con")}</span>
              </div>
            </div>

            <BotonesOAuth cargando={isLoading} onCargando={setIsLoading} onError={(m) => setError(m || null)} />

            <div className="text-center text-sm">
              <span className="text-muted-foreground">{t("¿No tienes cuenta?")}</span>{" "}
              <Link href={siguiente ? `/auth/registro?next=${encodeURIComponent(siguiente)}` : "/auth/registro"} className="font-medium text-primary hover:underline">
                {t("Regístrate gratis")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
