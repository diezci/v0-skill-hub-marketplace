"use server"

import { revalidatePath } from "next/cache"
import { rpcEmpresa } from "@/lib/empresas/production-store"
import type { ResultadoEmpresa } from "@/lib/empresas/types"

/** Records a human review; never changes a Stripe account or a historic payout. */
export async function verificarEmpresaConIdentidadCobros(input: {
  empresaId: string; verificacionId: string; cif: string; cuentaStripe: string
  confirmacion: boolean; nota: string
}): Promise<ResultadoEmpresa> {
  if (!input || input.confirmacion !== true || typeof input.nota !== "string" || input.nota.trim().length < 20 || input.nota.length > 2000) return { error: "Confirma la comprobación de la cuenta e indica las evidencias revisadas (20–2.000 caracteres)." }
  const resultado = await rpcEmpresa<void>("empresa_revisar_verificacion_con_cobros", {
    p_empresa_id: input.empresaId, p_verificacion_id: input.verificacionId, p_cif: input.cif,
    p_cuenta_stripe: input.cuentaStripe, p_confirmacion: input.confirmacion, p_nota: input.nota,
  })
  if (resultado.error) return resultado
  revalidatePath("/mi-empresa"); revalidatePath("/mi-empresa/vista-previa"); revalidatePath("/profesionales")
  revalidatePath("/empresa/[id]", "page"); revalidatePath("/admin/verificaciones-empresas")
  return { data: undefined }
}
