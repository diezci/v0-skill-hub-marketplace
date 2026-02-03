"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Shield, Clock, CheckCircle, AlertCircle, XCircle, Package } from "lucide-react"
import type { EscrowTransaction } from "@/lib/escrow-types"
import { deliverWork, releaseEscrowFunds, refundEscrow, openDispute } from "@/app/actions/escrow"

interface EscrowStatusCardProps {
  transaction: EscrowTransaction
  userType: "client" | "professional"
  onUpdate?: () => void
}

const statusConfig = {
  pending_payment: {
    label: "Pendiente de Pago",
    icon: Clock,
    color: "bg-yellow-500",
  },
  funds_held: {
    label: "Fondos en Custodia",
    icon: Shield,
    color: "bg-blue-500",
  },
  in_progress: {
    label: "En Progreso",
    icon: Package,
    color: "bg-purple-500",
  },
  pending_approval: {
    label: "Pendiente de Aprobación",
    icon: Clock,
    color: "bg-orange-500",
  },
  completed: {
    label: "Completado",
    icon: CheckCircle,
    color: "bg-green-500",
  },
  refunded: {
    label: "Reembolsado",
    icon: XCircle,
    color: "bg-gray-500",
  },
  disputed: {
    label: "En Disputa",
    icon: AlertCircle,
    color: "bg-red-500",
  },
}

export function EscrowStatusCard({ transaction, userType, onUpdate }: EscrowStatusCardProps) {
  const [loading, setLoading] = useState(false)
  const config = statusConfig[transaction.status]
  const Icon = config.icon

  const handleDeliverWork = async () => {
    setLoading(true)
    try {
      await deliverWork(transaction.id)
      onUpdate?.()
    } catch (error) {
      alert("Error al entregar el trabajo")
    } finally {
      setLoading(false)
    }
  }

  const handleApproveWork = async () => {
    setLoading(true)
    try {
      await releaseEscrowFunds(transaction.id)
      onUpdate?.()
    } catch (error) {
      alert("Error al aprobar el trabajo")
    } finally {
      setLoading(false)
    }
  }

  const handleRefund = async () => {
    if (!confirm("¿Estás seguro de que quieres solicitar un reembolso?")) return

    setLoading(true)
    try {
      await refundEscrow(transaction.id, "Cliente solicitó reembolso")
      onUpdate?.()
    } catch (error) {
      alert("Error al procesar el reembolso")
    } finally {
      setLoading(false)
    }
  }

  const handleDispute = async () => {
    if (!confirm("¿Quieres abrir una disputa? Esto notificará al equipo de soporte.")) return

    setLoading(true)
    try {
      await openDispute(transaction.id, "Usuario abrió disputa")
      onUpdate?.()
    } catch (error) {
      alert("Error al abrir la disputa")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{transaction.serviceName}</CardTitle>
            <p className="text-sm text-muted-foreground">{transaction.description}</p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Monto:</span>
          <span className="text-xl font-bold">{(transaction.amount / 100).toFixed(2)}€</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Fecha de creación:</span>
          <span>{new Date(transaction.createdAt).toLocaleDateString("es-ES")}</span>
        </div>

        {transaction.deliveryDate && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fecha de entrega:</span>
            <span>{new Date(transaction.deliveryDate).toLocaleDateString("es-ES")}</span>
          </div>
        )}

        {/* Status info */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            {transaction.status === "funds_held" &&
              "Los fondos están seguros en custodia. El profesional puede comenzar el trabajo."}
            {transaction.status === "in_progress" &&
              "El profesional está trabajando en tu proyecto. Los fondos están protegidos."}
            {transaction.status === "pending_approval" &&
              userType === "client" &&
              "El profesional ha entregado el trabajo. Revísalo y apruébalo para liberar los fondos."}
            {transaction.status === "pending_approval" &&
              userType === "professional" &&
              "Has entregado el trabajo. Esperando aprobación del cliente."}
            {transaction.status === "completed" && "Trabajo completado. Fondos liberados con éxito."}
            {transaction.status === "refunded" && "Transacción reembolsada."}
            {transaction.status === "disputed" && "Disputa en curso. El equipo de soporte está revisando el caso."}
          </AlertDescription>
        </Alert>

        {/* Actions for professional */}
        {userType === "professional" && transaction.status === "in_progress" && (
          <Button onClick={handleDeliverWork} disabled={loading} className="w-full">
            Marcar como Entregado
          </Button>
        )}

        {/* Actions for client */}
        {userType === "client" && transaction.status === "pending_approval" && (
          <div className="flex gap-2">
            <Button onClick={handleApproveWork} disabled={loading} className="flex-1">
              Aprobar Trabajo
            </Button>
            <Button onClick={handleDispute} disabled={loading} variant="outline" className="flex-1 bg-transparent">
              Abrir Disputa
            </Button>
          </div>
        )}

        {userType === "client" && ["in_progress", "pending_approval"].includes(transaction.status) && (
          <Button onClick={handleRefund} disabled={loading} variant="destructive" className="w-full">
            Solicitar Reembolso
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
