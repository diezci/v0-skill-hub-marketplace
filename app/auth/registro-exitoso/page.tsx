import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function RegistroExitosoPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">¡Registro Exitoso!</CardTitle>
            <CardDescription>Tu cuenta ha sido creada correctamente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium mb-2">Verifica tu email</p>
              <p>
                Hemos enviado un enlace de verificación a tu correo electrónico. Por favor revisa tu bandeja de entrada
                y haz clic en el enlace para activar tu cuenta.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Una vez verificada tu cuenta, podrás:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Acceder a tu perfil</li>
                <li>Solicitar o ofrecer servicios</li>
                <li>Usar el chat para comunicarte</li>
                <li>Realizar pagos seguros</li>
              </ul>
            </div>
            <Button asChild className="w-full">
              <Link href="/auth/login">Ir al inicio de sesión</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
