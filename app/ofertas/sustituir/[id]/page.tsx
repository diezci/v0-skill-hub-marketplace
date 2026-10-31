import Link from "next/link"
import { redirect } from "next/navigation"
import { obtenerContextoSustitucion } from "@/app/actions/oferta-sustitucion"
import { OfertaSustitucion } from "@/components/empresas/oferta-sustitucion"
import { getT } from "@/lib/i18n-servidor"

export default async function SustituirOfertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await obtenerContextoSustitucion(id)
  if (result.codigo === "NO_AUTENTICADO") redirect(`/auth/login?next=${encodeURIComponent(`/ofertas/sustituir/${id}`)}`)
  const { t } = await getT()
  return <main className="container mx-auto max-w-2xl space-y-5 px-4 py-8">
    <Link href="/mi-empresa" className="text-sm underline">{t("Volver a Mi empresa")}</Link>
    <h1 className="text-2xl font-bold">{t("Nueva oferta vinculada")}</h1>
    {result.creada ? <div className="space-y-3"><p role="status">{t(result.creada.estado === "aceptada" ? "Oferta vinculada aceptada. Puedes consultar su estado." : "Oferta vinculada enviada. El cliente debe aceptar esta nueva propuesta.")}</p><Link className="underline" href={`/mis-ofertas?oferta=${encodeURIComponent(result.creada.id)}`}>{t("Ver mi oferta")}</Link></div> : result.error || !result.data ? <p role="alert" className="text-destructive">{result.error || t("No tienes permiso para sustituir esta oferta")}</p> : <OfertaSustitucion key={result.data.oferta_origen_id} contexto={result.data} />}
  </main>
}
