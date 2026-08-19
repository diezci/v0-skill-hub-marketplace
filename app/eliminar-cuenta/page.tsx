import type { Metadata } from "next"
import Link from "next/link"
import { Mail, ShieldCheck, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { EliminarCuentaDialog } from "@/components/eliminar-cuenta-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Eliminar una cuenta | Diime",
  description: "Solicita y completa la eliminación de tu cuenta de Diime y de los datos asociados.",
}

export default async function EliminarCuentaPage() {
  const supabase = await createClient()
  const user = supabase ? (await supabase.auth.getUser()).data.user : null

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Trash2 className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Eliminar una cuenta de Diime</CardTitle>
          <CardDescription>
            Esta página permite solicitar y completar el borrado de la cuenta y de los datos que no debamos conservar
            por obligaciones legales, contables o por reclamaciones abiertas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              El perfil público, las publicaciones abiertas, el portfolio y el acceso a la cuenta se eliminan. Antes de
              confirmar verás qué ocurre con trabajos, pagos o disputas pendientes.
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              El proceso requiere iniciar sesión para comprobar que la solicitud pertenece realmente al titular.
            </p>
          </div>

          {user ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="mb-3 text-sm">
                Has iniciado sesión como <span className="font-medium">{user.email}</span>.
              </p>
              <EliminarCuentaDialog />
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/auth/login?next=/eliminar-cuenta">Iniciar sesión y eliminar mi cuenta</Link>
              </Button>
              <Button asChild variant="outline" className="bg-transparent">
                <a href="mailto:contacto@diime.es?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20cuenta%20Diime">
                  <Mail className="mr-2 h-4 w-4" />
                  Pedir ayuda a soporte
                </a>
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Consulta los detalles sobre conservación y tus derechos en la{" "}
            <Link href="/legal/privacidad" className="underline underline-offset-4 hover:text-foreground">
              política de privacidad
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
