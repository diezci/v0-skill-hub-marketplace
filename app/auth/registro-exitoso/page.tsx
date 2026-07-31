import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, HardHat, ArrowRight } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

// Tras el registro normal se invita a crear el perfil profesional. Se destaca
// cuando la persona venía justamente de "quiero ser profesional"
// (/convertirse-profesional arrastra ?siguiente=profesional), pero se ofrece
// siempre: cualquiera puede decidir ofrecer servicios después.
export default async function RegistroExitosoPage({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>
}) {
  const { siguiente } = await searchParams
  const vieneComoProfesional = siguiente === "profesional"

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle className="text-2xl">¡Cuenta creada!</CardTitle>
            <CardDescription>Ya formas parte de Diime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Paso siguiente para quien va a ofrecer servicios: sin categorías
                ni provincias no le llegará ninguna demanda, así que se explica. */}
            <div
              className={`rounded-lg border p-4 ${
                vieneComoProfesional ? "border-emerald-500/40 bg-emerald-500/10" : "bg-muted/40"
              }`}
            >
              <p className="font-medium flex items-center gap-2">
                <HardHat className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                {vieneComoProfesional ? "Ya solo te falta tu perfil profesional" : "¿Vas a ofrecer servicios?"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Completa tu perfil profesional y elige los servicios y las provincias que cubres. Es lo que decide de
                qué demandas te avisamos, así que sin ello no recibirás ninguna.
              </p>
              <Button asChild className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700">
                <Link href="/mi-perfil?completar=profesional">
                  Crear mi perfil profesional
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Link>
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Si solo quieres contratar servicios, ya puedes:</p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Publicar una demanda y recibir ofertas</li>
                <li>Hablar por el chat con los profesionales</li>
                <li>Pagar de forma protegida, con el dinero en custodia</li>
              </ul>
            </div>

            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/">Publicar una demanda</Link>
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Si te pedimos verificar tu correo, revisa tu bandeja de entrada.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
