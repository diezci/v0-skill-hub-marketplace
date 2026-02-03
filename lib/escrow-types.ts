export type EscrowStatus =
  | "pending_payment"
  | "funds_held"
  | "in_progress"
  | "pending_approval"
  | "completed"
  | "refunded"
  | "disputed"

export interface EscrowTransaction {
  id: string
  orderId: string
  clientId: string
  professionalId: string
  amount: number // in cents
  status: EscrowStatus
  stripePaymentIntentId?: string
  stripeTxId?: string
  createdAt: string
  completedAt?: string
  description: string
  serviceName: string
  deliveryDate?: string
  milestones?: Milestone[]
}

export interface Milestone {
  id: string
  description: string
  amount: number
  status: "pending" | "completed" | "approved"
  dueDate: string
}
