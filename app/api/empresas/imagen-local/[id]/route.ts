import { validarAccesoEmpresasLocal } from "@/lib/empresas/service"
import { empresaLocalStore } from "@/lib/empresas/local-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await validarAccesoEmpresasLocal()
    const imagen = await empresaLocalStore.imagen((await params).id)
    if (!imagen) return new Response(null, { status: 404 })
    return new Response(Buffer.from(imagen.contenido), { headers: {
      "Content-Type": imagen.tipo, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    } })
  } catch { return new Response(null, { status: 404 }) }
}
