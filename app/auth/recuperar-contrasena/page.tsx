"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useState } from "react"
import { Mail, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react"

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/actualizar-contrasena`,
      })

      if (error) throw error

      setSuccess(true)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Error al enviar el email")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-3xl font-bold tracking-tight">Recuperar Contraseña</CardTitle>
            <CardDescription className="text-base">
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!success ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
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
                      className="pl-10"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? "Enviando..." : "Enviar enlace de recuperación"}
                </Button>

                <div className="text-center">
                  <Link
                    href="/auth/login"
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Volver al inicio de sesión
                  </Link>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">¡Email enviado!</h3>
                  <p className="text-sm text-muted-foreground">
                    Hemos enviado un enlace de recuperación a <strong>{email}</strong>. Por favor revisa tu bandeja de
                    entrada y sigue las instrucciones.
                  </p>
                </div>
                <Button asChild variant="outline" className="w-full bg-transparent">
                  <Link href="/auth/login">Volver al inicio de sesión</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
