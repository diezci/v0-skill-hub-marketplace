import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Normas de la comunidad | Diime",
  description: "Reglas de publicación, seguridad y moderación de la comunidad de Diime.",
}

export default function NormasComunidad() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold">Normas de la comunidad</h1>
      <p className="mb-10 text-sm text-muted-foreground">Última actualización: agosto de 2026</p>
      <div className="space-y-8 leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">1. Trato seguro y respetuoso</h2>
          <p>
            No se permiten amenazas, acoso, discriminación, suplantación, fraude, extorsión ni la publicación de datos
            personales de terceros sin autorización.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">2. Contenido y servicios prohibidos</h2>
          <p>
            Se prohíben el contenido sexual explícito, la explotación de menores, la violencia gráfica, el odio, los
            servicios ilegales, la venta de drogas o armas y cualquier contenido que infrinja derechos de terceros.
            Las demandas, perfiles, ofertas, mensajes, archivos y valoraciones deben estar relacionados con un servicio
            profesional legítimo.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">3. Moderación</h2>
          <p>
            Diime puede filtrar, ocultar o retirar contenido, limitar funciones y suspender o cerrar cuentas cuando haya
            indicios de abuso o incumplimiento. Los casos urgentes y los reportes se revisan con prioridad.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">4. Reportar y bloquear</h2>
          <p>
            Puedes reportar un perfil, un mensaje o una conducta desde la propia app. También puedes bloquear a otra
            persona para impedir nuevas conversaciones. Si existe riesgo inmediato, contacta además con los servicios de
            emergencia o las autoridades competentes.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold text-foreground">5. Contacto</h2>
          <p>
            Para una revisión de seguridad escribe a{" "}
            <a href="mailto:contacto@diime.es" className="text-primary hover:underline">
              contacto@diime.es
            </a>{" "}
            o utiliza la opción <Link href="/incidencias" className="text-primary hover:underline">Incidencias</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}
