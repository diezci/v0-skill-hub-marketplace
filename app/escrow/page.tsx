"use client"

import { useState, useEffect } from "react"
import { EscrowStatusCard } from "@/components/escrow-status-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { obtenerTransaccionesEscrow } from "@/app/actions/escrow"
import { Shield, Loader2 } from "lucide-react"

export default function EscrowPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userType, setUserType] = useState<"client" | "professional">("client")

  const loadTransactions = async () => {
    setLoading(true)
    const result = await obtenerTransaccionesEscrow()
    if (result.data) {
      setTransactions(result.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTransactions()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8 flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Pagos Protegidos con Escrow</h1>
          <p className="text-muted-foreground">Tus fondos están seguros hasta que el trabajo sea completado</p>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">Todos ({transactions.length})</TabsTrigger>
          <TabsTrigger value="in_progress">
            En Progreso ({transactions.filter((t) => t.estado === "en_progreso").length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pendientes ({transactions.filter((t) => t.estado === "trabajo_entregado").length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completados ({transactions.filter((t) => ["completado", "reembolsado"].includes(t.estado)).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No hay transacciones escrow</p>
          ) : (
            transactions.map((transaction) => (
              <EscrowStatusCard
                key={transaction.id}
                transaction={transaction}
                userType={userType}
                onUpdate={loadTransactions}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="in_progress" className="space-y-4">
          {transactions
            .filter((t) => t.estado === "en_progreso")
            .map((transaction) => (
              <EscrowStatusCard
                key={transaction.id}
                transaction={transaction}
                userType={userType}
                onUpdate={loadTransactions}
              />
            ))}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {transactions
            .filter((t) => t.estado === "trabajo_entregado")
            .map((transaction) => (
              <EscrowStatusCard
                key={transaction.id}
                transaction={transaction}
                userType={userType}
                onUpdate={loadTransactions}
              />
            ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {transactions
            .filter((t) => ["completado", "reembolsado"].includes(t.estado))
            .map((transaction) => (
              <EscrowStatusCard
                key={transaction.id}
                transaction={transaction}
                userType={userType}
                onUpdate={loadTransactions}
              />
            ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
