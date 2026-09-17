import { getT } from "@/lib/i18n-servidor"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Política de cookies | Diime"),
  }
}

export default async function Cookies() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">{t("Política de cookies")}</h1>
      <p className="text-sm text-muted-foreground mb-10">{t("Última actualización: junio 2026")}</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("¿Qué son las cookies?")}</h2>
          <p>{t("Las cookies son pequeños ficheros que se almacenan en tu dispositivo cuando visitas una web. Diime utiliza cookies propias y de terceros para mejorar tu experiencia.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("Tipos de cookies que usamos")}</h2>
          <p><strong>{t("Cookies técnicas (necesarias):")}</strong> {" "}{t("Imprescindibles para el funcionamiento de la plataforma (autenticación, sesión de usuario y pago protegido).")}</p>
          <p className="mt-2"><strong>{t("Analítica opcional:")}</strong> {" "}{t("actualmente no cargamos una herramienta de analítica opcional. La preferencia se conserva para que cualquier futura activación requiera consentimiento previo.")}</p>
          <p className="mt-2"><strong>{t("App nativa:")}</strong> {" "}{t("la versión de iOS y Android guarda automáticamente la opción «solo necesarias» y no activa analítica opcional.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("Cómo desactivar las cookies")}</h2>
          <p>{t("Puedes configurar tu navegador para rechazar cookies. Ten en cuenta que desactivar cookies técnicas puede afectar al funcionamiento de la plataforma.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("Contacto")}</h2>
          <p>{t("Para cualquier consulta sobre el uso de cookies escríbenos a")}{" "}<a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a>.</p>
        </section>
      </div>
    </div>
  )
}
