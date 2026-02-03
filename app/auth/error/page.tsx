import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Error de Autenticación</CardTitle>
            <CardDescription>Ha ocurrido un error al procesar tu solicitud</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
              Por favor intenta nuevamente o contacta al soporte si el problema persiste.
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1 bg-transparent">
                <Link href="/auth/registro">Registro</Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="/auth/login">Iniciar Sesión</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
