"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Mail, Lock, AlertCircle } from "lucide-react"
import { BotonesOAuth } from "@/components/botones-oauth"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const router = useRouter()

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

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      const requested = new URLSearchParams(window.location.search).get("next")
      const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/"
      router.push(destination)
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al iniciar sesión")
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true"></div>
      <div className="w-full max-w-md z-10">
        <Card className="shadow-2xl border-0 backdrop-blur-md bg-card/95">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">Bienvenido</CardTitle>
            <CardDescription className="text-base">Inicia sesión para acceder a tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    className={`pl-10 ${emailError ? "border-red-500" : ""}`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (emailError) validateEmail(e.target.value)
                    }}
                    onBlur={() => validateEmail(email)}
                  />
                </div>
                {emailError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {emailError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Contraseña
                  </Label>
                  <Link href="/auth/recuperar-contrasena" className="text-xs text-primary hover:underline">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
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
                    {passwordError}
                  </p>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">O continúa con</span>
              </div>
            </div>

            <BotonesOAuth cargando={isLoading} onCargando={setIsLoading} onError={(m) => setError(m || null)} />

            <div className="text-center text-sm">
              <span className="text-muted-foreground">¿No tienes cuenta?</span>{" "}
              <Link href="/auth/registro" className="font-medium text-primary hover:underline">
                Regístrate gratis
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
