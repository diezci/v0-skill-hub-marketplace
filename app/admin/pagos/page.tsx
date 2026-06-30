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
import { CreditCard, Clock, CheckCircle2, AlertCircle, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { formatearFecha } from "@/lib/utils"

interface Transaccion {
  id: string
  trabajo_id: string | null
  cliente_id: string | null
  profesional_id: string | null
  monto: number | null
  monto_base: number | null
  retencion_plataforma: number | null
  pago_neto_proveedor: number | null
  monto_reembolsado: number | null
  estado: string
  stripe_payment_intent_id: string | null
  created_at: string
  trabajo?: { titulo: string | null } | null
  cliente?: { nombre: string | null; apellido: string | null } | null
  profesional?: { nombre: string | null; apellido: string | null } | null
}

const eur = (v: number | null | undefined) => `${(v ?? 0).toFixed(2)} EUR`
// Comisión de la plataforma: la retención si está calculada, si no monto - neto.
const comisionDe = (t: Transaccion) =>
  t.retencion_plataforma ?? Math.max(0, (t.monto ?? 0) - (t.pago_neto_proveedor ?? 0))

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
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      const rows = (data as any[]) || []

      // Enriquecer con título del trabajo y nombres de las partes (consultas
      // separadas para no depender de relaciones Fk frágiles en el embed).
      const trabajoIds = [...new Set(rows.map((r) => r.trabajo_id).filter(Boolean))]
      const userIds = [...new Set(rows.flatMap((r) => [r.cliente_id, r.profesional_id]).filter(Boolean))]

      const [trabajosRes, profilesRes] = await Promise.all([
        trabajoIds.length
          ? supabase.from("trabajos").select("id, titulo").in("id", trabajoIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id, nombre, apellido").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ])

      const trabajoMap = new Map((trabajosRes.data || []).map((t: any) => [t.id, t]))
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]))

      const enriquecidas: Transaccion[] = rows.map((r) => ({
        ...r,
        trabajo: r.trabajo_id ? { titulo: trabajoMap.get(r.trabajo_id)?.titulo ?? null } : null,
        cliente: r.cliente_id ? profileMap.get(r.cliente_id) ?? null : null,
        profesional: r.profesional_id ? profileMap.get(r.profesional_id) ?? null : null,
      }))

      setTransacciones(enriquecidas)
    } catch (error) {
      console.error("Error loading transactions:", error)
    } finally {
      setLoading(false)
    }
  }

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case "fondos_retenidos":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            En custodia
          </Badge>
        )
      case "completado":
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
      case "disputa":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            En disputa
          </Badge>
        )
      case "pendiente":
        return (
          <Badge className="bg-muted text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente de pago
          </Badge>
        )
      default:
        return <Badge variant="secondary">{estado}</Badge>
    }
  }

  const retenidas = transacciones.filter((t) => t.estado === "fondos_retenidos")
  const liberadas = transacciones.filter((t) => t.estado === "completado")
  const reembolsadas = transacciones.filter((t) => t.estado === "reembolsado")
  const disputadas = transacciones.filter((t) => t.estado === "disputa")

  const totalRetenido = retenidas.reduce((sum, t) => sum + (t.monto ?? 0), 0)
  const totalLiberado = liberadas.reduce((sum, t) => sum + (t.monto ?? 0), 0)
  const totalComisiones = liberadas.reduce((sum, t) => sum + comisionDe(t), 0)
  const totalReembolsado = reembolsadas.reduce((sum, t) => sum + (t.monto_reembolsado ?? t.monto ?? 0), 0)

  const nombre = (p?: { nombre: string | null; apellido: string | null } | null) =>
    p ? `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim() || "-" : "-"

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
              <TableCell>{nombre(transaccion.cliente)}</TableCell>
              <TableCell>{nombre(transaccion.profesional)}</TableCell>
              <TableCell className="text-right font-medium">{eur(transaccion.monto)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{eur(comisionDe(transaccion))}</TableCell>
              <TableCell className="text-right text-emerald-600 font-medium">
                {eur(transaccion.pago_neto_proveedor)}
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
            <p className="text-2xl font-bold text-amber-600">{eur(totalRetenido)}</p>
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
            <p className="text-2xl font-bold text-emerald-600">{eur(totalLiberado)}</p>
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
            <p className="text-2xl font-bold text-violet-600">{eur(totalComisiones)}</p>
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
            <p className="text-2xl font-bold text-blue-600">{eur(totalReembolsado)}</p>
            <p className="text-xs text-muted-foreground mt-1">{reembolsadas.length} reembolsos</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Tabs */}
      <Card>
        <Tabs defaultValue="todas" className="w-full">
          <CardHeader>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="todas">Todas ({transacciones.length})</TabsTrigger>
              <TabsTrigger value="retenidas">En custodia ({retenidas.length})</TabsTrigger>
              <TabsTrigger value="liberadas">Liberadas ({liberadas.length})</TabsTrigger>
              <TabsTrigger value="disputadas">En disputa ({disputadas.length})</TabsTrigger>
              <TabsTrigger value="reembolsadas">Reembolsadas ({reembolsadas.length})</TabsTrigger>
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
