"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExternalLink, FileText, Search } from "lucide-react"
import type { AdminPersonaTrabajo, AdminTrabajo } from "@/app/actions/admin-trabajos"
import { formatearFecha, formatearMoneda } from "@/lib/utils"

const ESTADOS_TRABAJO: Record<string, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: "Pendiente", clase: "bg-muted text-muted-foreground" },
  pendiente_pago: { etiqueta: "Pendiente de pago", clase: "bg-muted text-muted-foreground" },
  en_progreso: { etiqueta: "En progreso", clase: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  entregado: { etiqueta: "Entregado", clase: "bg-violet-500/10 text-violet-700 border-violet-500/30" },
  completado: { etiqueta: "Completado", clase: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  rechazado: { etiqueta: "Rechazado", clase: "bg-red-500/10 text-red-700 border-red-500/30" },
  cancelado: { etiqueta: "Cancelado", clase: "bg-muted text-muted-foreground" },
  en_disputa: { etiqueta: "En disputa", clase: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
}

const ESTADOS_PAGO: Record<string, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: "Pendiente", clase: "bg-muted text-muted-foreground" },
  retenido: { etiqueta: "Transferencia pendiente", clase: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  fondos_retenidos: { etiqueta: "Transferencia pendiente", clase: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  liberado: { etiqueta: "Liberado", clase: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  completado: { etiqueta: "Liberado", clase: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  reembolsado: { etiqueta: "Reembolsado", clase: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  disputa: { etiqueta: "Congelado", clase: "bg-red-500/10 text-red-700 border-red-500/30" },
  cancelado: { etiqueta: "Cancelado", clase: "bg-muted text-muted-foreground" },
}

function nombrePersona(persona: AdminPersonaTrabajo | null) {
  if (!persona) return "Usuario no disponible"
  return `${persona.nombre ?? ""} ${persona.apellido ?? ""}`.trim() || "Sin nombre"
}

function EstadoBadge({ estado, tipo }: { estado: string | null | undefined; tipo: "trabajo" | "pago" }) {
  if (!estado && tipo === "pago") return <Badge variant="outline">Sin pago</Badge>
  const mapa = tipo === "trabajo" ? ESTADOS_TRABAJO : ESTADOS_PAGO
  const config = mapa[estado || ""] ?? {
    etiqueta: estado || "Sin estado",
    clase: "bg-muted text-muted-foreground",
  }
  return <Badge className={config.clase}>{config.etiqueta}</Badge>
}

function EnlacePersona({ persona }: { persona: AdminPersonaTrabajo | null }) {
  if (!persona) return <span className="text-muted-foreground">Usuario no disponible</span>
  return (
    <Link href={`/admin/usuarios/${persona.id}`} className="font-medium hover:text-primary hover:underline">
      {nombrePersona(persona)}
    </Link>
  )
}

export function AdminTrabajosTable({
  trabajos,
  usuarioId,
  mostrarFiltros = true,
  mensajeVacio = "No hay trabajos en esta sección.",
}: {
  trabajos: AdminTrabajo[]
  usuarioId?: string
  mostrarFiltros?: boolean
  mensajeVacio?: string
}) {
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState("todos")

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase("es")
    return trabajos.filter((trabajo) => {
      const coincideEstado = estado === "todos" || trabajo.estado === estado
      if (!coincideEstado) return false
      if (!termino) return true
      const referencia = `TRB-${trabajo.id.slice(0, 8)}`
      return [
        trabajo.titulo,
        referencia,
        nombrePersona(trabajo.cliente),
        nombrePersona(trabajo.profesional),
      ].some((valor) => valor.toLocaleLowerCase("es").includes(termino))
    })
  }, [busqueda, estado, trabajos])

  const estadosDisponibles = useMemo(
    () => [...new Set(trabajos.map((trabajo) => trabajo.estado).filter(Boolean))].sort(),
    [trabajos],
  )

  return (
    <div className="space-y-4">
      {mostrarFiltros && trabajos.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por trabajo, referencia o usuario..."
              className="pl-9"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-full sm:w-[210px]">
              <SelectValue placeholder="Estado del trabajo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {estadosDisponibles.map((valor) => (
                <SelectItem key={valor} value={valor}>
                  {ESTADOS_TRABAJO[valor]?.etiqueta ?? valor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Servicio</TableHead>
              {usuarioId ? <TableHead>Papel</TableHead> : <TableHead>Cliente</TableHead>}
              {usuarioId ? <TableHead>Contraparte</TableHead> : <TableHead>Proveedor</TableHead>}
              <TableHead className="text-right">Precio acordado</TableHead>
              <TableHead>Estado del trabajo</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Contratación</TableHead>
              <TableHead className="min-w-[245px] text-right">Factura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {trabajos.length === 0 ? mensajeVacio : "No hay resultados con estos filtros."}
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((trabajo) => {
                const esCliente = usuarioId === trabajo.cliente_id
                const contraparte = esCliente ? trabajo.profesional : trabajo.cliente
                const fechaContratacion = trabajo.escrow?.fecha_retencion || trabajo.escrow?.created_at

                return (
                  <TableRow key={trabajo.id}>
                    <TableCell className="min-w-[220px]">
                      <p className="font-medium">{trabajo.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        TRB-{trabajo.id.slice(0, 8).toUpperCase()}
                      </p>
                    </TableCell>
                    {usuarioId ? (
                      <TableCell>
                        <Badge variant="outline">{esCliente ? "Como cliente" : "Como proveedor"}</Badge>
                      </TableCell>
                    ) : (
                      <TableCell className="min-w-[160px]">
                        <EnlacePersona persona={trabajo.cliente} />
                      </TableCell>
                    )}
                    {usuarioId ? (
                      <TableCell className="min-w-[160px]">
                        <EnlacePersona persona={contraparte} />
                      </TableCell>
                    ) : (
                      <TableCell className="min-w-[160px]">
                        <EnlacePersona persona={trabajo.profesional} />
                      </TableCell>
                    )}
                    <TableCell className="text-right font-medium">
                      {formatearMoneda(trabajo.escrow?.monto_base ?? trabajo.precio_acordado)}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={trabajo.estado} tipo="trabajo" />
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={trabajo.escrow?.estado} tipo="pago" />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {trabajo.contratado ? formatearFecha(fechaContratacion) : "No contratado"}
                    </TableCell>
                    <TableCell>
                      {trabajo.contratado ? (
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <a
                              href={`/trabajos/${trabajo.id}/factura?vista=cliente`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver la factura desde la perspectiva del cliente"
                            >
                              <FileText className="h-3.5 w-3.5" /> Vista cliente
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline" className="gap-1.5">
                            <a
                              href={`/trabajos/${trabajo.id}/factura?vista=proveedor`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver la factura y liquidación del proveedor"
                            >
                              <FileText className="h-3.5 w-3.5" /> Vista proveedor
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <p className="text-right text-xs text-muted-foreground">Aún no generada</p>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
