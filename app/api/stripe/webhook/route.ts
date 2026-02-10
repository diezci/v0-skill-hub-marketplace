import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Use service role for webhook (no user context)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error("[v0] Webhook signature verification failed:", err.message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const supabase = getAdminClient()

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      const metadata = session.metadata

      if (metadata?.type !== "escrow" || !metadata?.trabajo_id) {
        break
      }

      const trabajoId = metadata.trabajo_id

      // Update escrow status to paid
      await supabase
        .from("transacciones_escrow")
        .update({
          estado: "retenido",
          stripe_payment_intent_id: typeof session.payment_intent === "string" 
            ? session.payment_intent 
            : session.payment_intent?.id,
        })
        .eq("trabajo_id", trabajoId)
        .eq("estado", "pendiente")

      // Update trabajo status to in progress
      await supabase
        .from("trabajos")
        .update({
          estado: "en_progreso",
          fecha_inicio: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", trabajoId)

      // Create progress update
      await supabase.from("actualizaciones_trabajo").insert({
        trabajo_id: trabajoId,
        usuario_id: metadata.cliente_id,
        tipo: "pago",
        mensaje: `Pago de ${Number.parseFloat(metadata.total_cliente).toFixed(2)} EUR recibido. Los fondos quedan retenidos hasta la finalizacion del trabajo.`,
        progreso: 0,
      })

      console.log(`[v0] Escrow payment completed for trabajo ${trabajoId}`)
      break
    }

    case "checkout.session.expired": {
      const session = event.data.object
      const metadata = session.metadata

      if (metadata?.type !== "escrow" || !metadata?.trabajo_id) {
        break
      }

      // Mark escrow as failed
      await supabase
        .from("transacciones_escrow")
        .update({ estado: "fallido" })
        .eq("trabajo_id", metadata.trabajo_id)
        .eq("estado", "pendiente")

      console.log(`[v0] Escrow payment expired for trabajo ${metadata.trabajo_id}`)
      break
    }
  }

  return NextResponse.json({ received: true })
}
