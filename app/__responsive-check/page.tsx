import {
  Calendar,
  CheckCircle2,
  FileText,
  MessageSquare,
  Package,
  ShieldCheck,
  Star,
  Timer,
  XCircle,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export default function ResponsiveCheckPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="w-full min-w-0 max-w-full space-y-4">
        <Card className="w-full min-w-0 max-w-full overflow-hidden border-purple-500/50 bg-purple-500/5">
          <CardHeader className="min-w-0 px-4 sm:px-6">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2 sm:space-y-1">
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <CardTitle className="max-w-full break-words text-xl">
                    Reforma integral del hogar con un titulo especialmente largo
                  </CardTitle>
                  <Badge className="max-w-full whitespace-normal bg-purple-500 text-left leading-tight">
                    <Package className="mr-1 h-3 w-3 shrink-0" />
                    Pendiente de Confirmacion
                  </Badge>
                </div>
                <CardDescription className="break-words">
                  Categoria de reformas y mantenimiento con un nombre largo
                </CardDescription>
              </div>
              <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 text-left sm:block sm:w-auto sm:shrink-0 sm:text-right">
                <p className="min-w-0 break-words text-2xl font-bold">10.000,00 €</p>
                <Badge
                  variant="outline"
                  className="max-w-full whitespace-normal border-emerald-500/50 bg-transparent text-left leading-tight text-emerald-500"
                >
                  <ShieldCheck className="mr-1 h-3 w-3 shrink-0" />
                  Pagado · Protegido
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 space-y-6 px-4 sm:px-6">
            <div className="flex min-w-0 flex-col items-stretch gap-4 rounded-lg bg-muted/50 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-4 sm:flex-1">
                <Avatar className="h-14 w-14 shrink-0">
                  <AvatarFallback>PP</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">Pedro Pistacho con apellidos muy largos</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="h-4 w-4 shrink-0 fill-amber-500 text-amber-500" />
                    <span>4.7</span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full bg-transparent sm:ml-auto sm:w-auto sm:shrink-0">
                <MessageSquare className="mr-1 h-4 w-4" />
                Mensaje
              </Button>
            </div>

            <div className="min-w-0 space-y-2 overflow-hidden rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium">Contratacion</p>
              <p className="break-words text-sm text-muted-foreground">Materiales: incluidos</p>
              <div className="flex min-w-0 flex-wrap gap-3 pt-1">
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 break-words text-xs text-primary">
                  <FileText className="h-3 w-3 shrink-0" /> Ver factura y terminos
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progreso del trabajo</span>
                <span className="text-sm font-bold text-primary">100%</span>
              </div>
              <Progress value={100} className="h-3" />
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 sm:gap-4">
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">Inicio: </span>
                    <span className="font-medium">29 ago 2026</span>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2 text-sm">
                  <Timer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 break-words">
                    <span className="text-muted-foreground">Entrega estimada: </span>
                    <span className="font-medium">2 oct 2026</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-purple-500/30 bg-purple-500/10 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <Package className="mt-0.5 h-5 w-5 shrink-0 text-purple-500" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">El profesional ha marcado el trabajo como entregado</p>
                  <p className="break-words text-sm text-muted-foreground">
                    Revisa el trabajo realizado y confirma su finalizacion para liberar el pago.
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Button className="h-auto min-h-9 w-full whitespace-normal py-2 sm:flex-1">
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar y Liberar Pago
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-9 w-full whitespace-normal border-destructive/50 bg-transparent py-2 text-destructive hover:bg-destructive/10 sm:w-auto sm:shrink-0"
                >
                  <XCircle className="mr-1 h-4 w-4" /> Rechazar entrega
                </Button>
              </div>
              <p className="break-words pt-1 text-center text-xs text-muted-foreground">
                Si rechazas la entrega, el pago sigue retenido y el equipo de Diime decidira segun las pruebas y los
                terminos acordados.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
