import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { PerfilUnificadoPreview } from "@/components/local/perfil-unificado-preview"

export const dynamic = "force-dynamic"

export default async function Preview() {
  const host = (await headers()).get("host") || ""
  if (process.env.NODE_ENV === "production" || process.env.DIIME_PERFIL_PREVIEW !== "1" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) notFound()
  return <PerfilUnificadoPreview />
}
