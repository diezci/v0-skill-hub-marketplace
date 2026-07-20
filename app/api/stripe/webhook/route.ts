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
  } catch {
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

      // Mismo estado que la confirmación en página (confirmarPago): el resto de
      // la app solo entiende "fondos_retenidos". El antiguo "retenido" pasaba el
      // CHECK de la tabla pero dejaba el pago atascado: liberarlo era imposible.
      // `.select()` sin single: si quedaran filas "pendiente" duplicadas de
      // antiguo, un maybeSingle() fallaría y el pago no se consumaría.
      const { data: escrowsActualizados } = await supabase
        .from("transacciones_escrow")
        .update({
          estado: "fondos_retenidos",
          fecha_retencion: new Date().toISOString(),
          stripe_payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
        })
        .eq("trabajo_id", trabajoId)
        .eq("estado", "pendiente")
        .select("id, profesional_id")

      // Si no había fila en "pendiente" es que la confirmación en página ya lo
      // procesó: no repetir el resto (evita actualizaciones y avisos duplicados).
      const escrowActualizado = escrowsActualizados?.[0]
      if (!escrowActualizado) {
        break
      }

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

      // Avisar al proveedor igual que hace la confirmación en página. Aquí no hay
      // sesión de usuario, así que se inserta directamente con el cliente admin.
      const { data: trabajoPagado } = await supabase
        .from("trabajos")
        .select("titulo, solicitud_id")
        .eq("id", trabajoId)
        .maybeSingle()

      // El pago consuma la contratación (igual que confirmarPagoEscrow): la
      // demanda pasa a en_progreso y las demás ofertas quedan rechazadas.
      if (trabajoPagado?.solicitud_id) {
        await supabase
          .from("solicitudes")
          .update({ estado: "en_progreso" })
          .eq("id", trabajoPagado.solicitud_id)
        await supabase
          .from("ofertas")
          .update({ estado: "rechazada", updated_at: new Date().toISOString() })
          .eq("solicitud_id", trabajoPagado.solicitud_id)
          .eq("estado", "pendiente")
      }
      if (escrowActualizado.profesional_id) {
        await supabase.from("notificaciones").insert({
          usuario_id: escrowActualizado.profesional_id,
          tipo: "pago_recibido",
          titulo: "El cliente ha pagado: puedes empezar",
          mensaje: `El pago de "${trabajoPagado?.titulo ?? "un trabajo"}" ya está retenido en custodia. El trabajo pasa a En Progreso.`,
          link: "/mis-trabajos",
          leida: false,
        })
      }

      break
    }

    case "checkout.session.expired": {
      const session = event.data.object
      const metadata = session.metadata

      if (metadata?.type !== "escrow" || !metadata?.trabajo_id) {
        break
      }

      // "fallido" no existe en el CHECK de estados de la tabla, así que este
      // update fallaba en silencio y el escrow se quedaba en "pendiente".
      // "cancelado" sí es un estado válido.
      await supabase
        .from("transacciones_escrow")
        .update({ estado: "cancelado" })
        .eq("trabajo_id", metadata.trabajo_id)
        .eq("estado", "pendiente")

      break
    }
  }

  return NextResponse.json({ received: true })
}
