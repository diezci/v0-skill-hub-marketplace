import "server-only"

import Stripe from "stripe"

// Inicialización perezosa: NO instanciar Stripe en la carga del módulo.
// DIIME_STRIPE_SECRET_KEY tiene prioridad en producción. La variable estándar
// se conserva como fallback para los sandboxes y entornos locales existentes.
// Si ninguna está definida, hacerlo aquí lanzaría un error al
// importar cualquier acción de escrow (rompiendo páginas como "Mis Solicitudes"
// aunque no usen Stripe). Con el proxy, solo falla si realmente se usa Stripe.
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.DIIME_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error("La clave privada de Stripe no está configurada. Los pagos no están disponibles.")
    }
    stripeInstance = new Stripe(key)
  }
  return stripeInstance
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe()
    const value = (client as any)[prop]
    return typeof value === "function" ? value.bind(client) : value
  },
})
