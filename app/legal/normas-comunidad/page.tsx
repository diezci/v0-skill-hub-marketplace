import { getT } from "@/lib/i18n-servidor"
import Link from "next/link"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Normas de la comunidad | Diime"),
    description: t("Reglas de publicación, seguridad y moderación de la comunidad de Diime."),
  }
}

export default async function NormasComunidad() {
  const { t } = await getT()

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold">{t("Normas de la comunidad")}</h1>
      <p className="mb-10 text-sm text-muted-foreground">{t("Última actualización: agosto de 2026")}</p>
      <div className="space-y-8 leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("1. Trato seguro y respetuoso")}</h2>
          <p>
            {t("No se permiten amenazas, acoso, discriminación, suplantación, fraude, extorsión ni la publicación de datos personales de terceros sin autorización.")}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("2. Contenido y servicios prohibidos")}</h2>
          <p>
            {t("Se prohíben el contenido sexual explícito, la explotación de menores, la violencia gráfica, el odio, los servicios ilegales, la venta de drogas o armas y cualquier contenido que infrinja derechos de terceros. Las demandas, perfiles, ofertas, mensajes, archivos y valoraciones deben estar relacionados con un servicio profesional legítimo.")}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("3. Moderación")}</h2>
          <p>
            {t("Diime puede filtrar, ocultar o retirar contenido, limitar funciones y suspender o cerrar cuentas cuando haya indicios de abuso o incumplimiento. Los casos urgentes y los reportes se revisan con prioridad.")}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("4. Reportar y bloquear")}</h2>
          <p>
            {t("Puedes reportar un perfil, un mensaje o una conducta desde la propia app. También puedes bloquear a otra persona para impedir nuevas conversaciones. Si existe riesgo inmediato, contacta además con los servicios de emergencia o las autoridades competentes.")}</p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">{t("5. Contacto")}</h2>
          <p>
            {t("Para una revisión de seguridad escribe a")}{" "}
            <a href="mailto:contacto@diime.es" className="text-primary hover:underline">
              contacto@diime.es
            </a>{" "}
            {t("o utiliza la opción")}{" "}<Link href="/incidencias" className="text-primary hover:underline">{t("Incidencias")}</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
