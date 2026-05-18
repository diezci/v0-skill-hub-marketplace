"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import { CreditCard, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { formatearFecha } from "@/lib/utils"

interface Transaccion {
  id: string
  trabajo_id: string
  monto: number
  comision_plataforma: number
  monto_profesional: number
  estado: string
  stripe_payment_intent_id: string | null
  created_at: string
  updated_at: string
  trabajo?: {
    titulo: string
    cliente?: {
      nombre: string
      apellido: string
    }
    profesional?: {
      profile?: {
        nombre: string
        apellido: string
      }
    }
  }
}

export default function AdminPagosPage() {
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    cargarTransacciones()
  }, [])

  const cargarTransacciones = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("transacciones_escrow")
        .select(`
          *,
          trabajo:trabajos(
            titulo,
            cliente:profiles!trabajos_cliente_id_fkey(nombre, apellido),
            profesional:profesionales!trabajos_profesional_id_fkey(
              profile:profiles(nombre, apellido)
            )
          )
        `)
        .order("created_at", { ascending: false })

      if (error) throw error

      setTransacciones(data || [])
    } catch (error) {
      console.error("Error loading transactions:", error)
    } finally {
      setLoading(false)
    }
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "retenido":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Retenido
          </Badge>
        )
      case "liberado":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Liberado
          </Badge>
        )
      case "reembolsado":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">
            <ArrowDownRight className="h-3 w-3 mr-1" />
            Reembolsado
          </Badge>
        )
      case "disputado":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            Disputado
          </Badge>
        )
      default:
        return <Badge variant="secondary">{estado}</Badge>
    }
  }

  const retenidas = transacciones.filter((t) => t.estado === "retenido")
  const liberadas = transacciones.filter((t) => t.estado === "liberado")
  const reembolsadas = transacciones.filter((t) => t.estado === "reembolsado")
  const disputadas = transacciones.filter((t) => t.estado === "disputado")

  const totalRetenido = retenidas.reduce((sum, t) => sum + t.monto, 0)
  const totalLiberado = liberadas.reduce((sum, t) => sum + t.monto, 0)
  const totalComisiones = liberadas.reduce((sum, t) => sum + t.comision_plataforma, 0)
  const totalReembolsado = reembolsadas.reduce((sum, t) => sum + t.monto, 0)

  const renderTransaccionesTable = (lista: Transaccion[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Trabajo</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Profesional</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead className="text-right">Comision</TableHead>
          <TableHead className="text-right">Neto Prof.</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
              No hay transacciones en esta categoria
            </TableCell>
          </TableRow>
        ) : (
          lista.map((transaccion) => (
            <TableRow key={transaccion.id}>
              <TableCell className="font-medium max-w-[200px] truncate">
                {transaccion.trabajo?.titulo || "Trabajo eliminado"}
              </TableCell>
              <TableCell>
                {transaccion.trabajo?.cliente
                  ? `${transaccion.trabajo.cliente.nombre} ${transaccion.trabajo.cliente.apellido}`
                  : "-"}
              </TableCell>
              <TableCell>
                {transaccion.trabajo?.profesional?.profile
                  ? `${transaccion.trabajo.profesional.profile.nombre} ${transaccion.trabajo.profesional.profile.apellido}`
                  : "-"}
              </TableCell>
              <TableCell className="text-right font-medium">
                {transaccion.monto.toFixed(2)} EUR
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {transaccion.comision_plataforma.toFixed(2)} EUR
              </TableCell>
              <TableCell className="text-right text-emerald-600 font-medium">
                {transaccion.monto_profesional.toFixed(2)} EUR
              </TableCell>
              <TableCell>{getEstadoBadge(transaccion.estado)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatearFecha(transaccion.created_at)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <CreditCard className="h-8 w-8 text-primary" />
          Gestion de Pagos
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitoriza todas las transacciones y pagos de la plataforma
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              En Escrow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{totalRetenido.toFixed(2)} EUR</p>
            <p className="text-xs text-muted-foreground mt-1">{retenidas.length} transacciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              Liberado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{totalLiberado.toFixed(2)} EUR</p>
            <p className="text-xs text-muted-foreground mt-1">{liberadas.length} transacciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-500" />
              Comisiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-violet-600">{totalComisiones.toFixed(2)} EUR</p>
            <p className="text-xs text-muted-foreground mt-1">Total ganado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-blue-500" />
              Reembolsado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{totalReembolsado.toFixed(2)} EUR</p>
            <p className="text-xs text-muted-foreground mt-1">{reembolsadas.length} reembolsos</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Tabs */}
      <Card>
        <Tabs defaultValue="todas" className="w-full">
          <CardHeader>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="todas">
                Todas ({transacciones.length})
              </TabsTrigger>
              <TabsTrigger value="retenidas">
                Retenidas ({retenidas.length})
              </TabsTrigger>
              <TabsTrigger value="liberadas">
                Liberadas ({liberadas.length})
              </TabsTrigger>
              <TabsTrigger value="disputadas">
                Disputadas ({disputadas.length})
              </TabsTrigger>
              <TabsTrigger value="reembolsadas">
                Reembolsadas ({reembolsadas.length})
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TabsContent value="todas" className="m-0">
                  {renderTransaccionesTable(transacciones)}
                </TabsContent>
                <TabsContent value="retenidas" className="m-0">
                  {renderTransaccionesTable(retenidas)}
                </TabsContent>
                <TabsContent value="liberadas" className="m-0">
                  {renderTransaccionesTable(liberadas)}
                </TabsContent>
                <TabsContent value="disputadas" className="m-0">
                  {renderTransaccionesTable(disputadas)}
                </TabsContent>
                <TabsContent value="reembolsadas" className="m-0">
                  {renderTransaccionesTable(reembolsadas)}
                </TabsContent>
              </>
            )}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
