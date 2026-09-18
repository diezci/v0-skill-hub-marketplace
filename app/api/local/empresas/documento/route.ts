import { esEmpresasLocal, obtenerDocumentoVerificacionEmpresaLocal } from "@/lib/empresas/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  if (!esEmpresasLocal()) return new Response("No disponible", { status: 404 })
  const resultado = await obtenerDocumentoVerificacionEmpresaLocal()
  if (resultado.error || !resultado.data) return Response.json({ error: resultado.error }, { status: 403, headers: { "Cache-Control": "no-store" } })
  return new Response(new Blob([resultado.data.contenido as BlobPart], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="documento-empresa.pdf"; filename*=UTF-8''${encodeURIComponent(resultado.data.nombre)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
