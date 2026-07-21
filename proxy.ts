import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

// Next 16 sustituye la convención "middleware" por "proxy": el fichero debe
// llamarse proxy.ts y exportar `proxy`. El comportamiento es el mismo, seguimos
// refrescando la sesión de Supabase en cada petición.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
