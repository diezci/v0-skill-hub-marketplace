import { AlertCircle, Briefcase, CheckCircle2, Clock, FileText } from "lucide-react"
import { obtenerTrabajosAdmin } from "@/app/actions/admin-trabajos"
import { AdminTrabajosTable } from "@/components/admin-trabajos-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function AdminTrabajosPage() {
  const resultado = await obtenerTrabajosAdmin()
  // Esta sección es de contrataciones consumadas: aceptar una oferta crea un
  // trabajo pendiente, pero solo el pago retenido genera factura.
  const trabajos = (resultado.data || []).filter((trabajo) => trabajo.contratado)
  const activos = trabajos.filter((trabajo) =>
    ["en_progreso", "entregado", "en_disputa"].includes(trabajo.estado),
  )
  const completados = trabajos.filter((trabajo) => trabajo.estado === "completado")

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Briefcase className="h-8 w-8 text-primary" />
          Trabajos y facturas
        </h1>
        <p className="mt-1 text-muted-foreground">
          Consulta todas las contrataciones y abre el documento generado para el cliente o para el proveedor.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Briefcase className="h-4 w-4" /> Contrataciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{trabajos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" /> En curso o revisión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{activos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> Completados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{completados.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" /> Facturas disponibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{trabajos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Con vista cliente y proveedor</p>
          </CardContent>
        </Card>
      </div>

      {resultado.error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>No se pudieron cargar los trabajos: {resultado.error}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Todas las contrataciones</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminTrabajosTable trabajos={trabajos} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
