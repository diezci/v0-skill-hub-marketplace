import { NextResponse } from "next/server"
import { enviarAlertaOperativaDiaria } from "@/lib/operaciones"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const resultado = await enviarAlertaOperativaDiaria()
    return NextResponse.json({
      ok: true,
      enviado: resultado.enviado,
      motivo: resultado.enviado ? undefined : resultado.motivo,
      total: resultado.resumen.total,
      generadoAt: resultado.resumen.generadoAt,
    })
  } catch (error) {
    console.error("[operaciones] Falló el control diario:", error)
    return NextResponse.json({ error: "Falló el control operativo diario" }, { status: 500 })
  }
}
