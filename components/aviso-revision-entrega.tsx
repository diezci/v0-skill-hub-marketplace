"use client"
import { useIdioma, useT } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"

export function AvisoRevisionEntrega({ fechaEntrega }: { fechaEntrega?: string | null }) {
  const t = useT()
  const { idioma } = useIdioma()
  const instante = fechaEntrega ? Date.parse(fechaEntrega) : NaN
  const limite = Number.isFinite(instante) ? new Date(instante + 7 * 86400000) : null
  return <p className="text-sm text-muted-foreground">
    {t("La entrega tiene un plazo de revisión de 7 días.")}{" "}
    {limite && <>{t("Revisión hasta:")}{" "}<time dateTime={limite.toISOString()}>{limite.toLocaleString(localeDe(idioma), { timeZone: "Europe/Madrid", dateStyle: "medium", timeStyle: "short" })}</time>.{" "}</>}
    {t("Si no hay respuesta, solicita mediación a Diime. Los fondos siguen retenidos y no se liberan automáticamente.")}
  </p>
}
