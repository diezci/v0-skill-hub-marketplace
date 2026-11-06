"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { crearServicioFinanzasAdmin } from "@/lib/admin-finanzas-servidor"

const consultar = crearServicioFinanzasAdmin({ sesion: createClient, admin: createAdminClient, stripe: () => stripe })

export async function obtenerResumenFinanzasAdmin() {
  return consultar()
}
