import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de cookies | Diime",
}

export default function Cookies() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Política de cookies</h1>
      <p className="text-sm text-muted-foreground mb-10">Última actualización: junio 2026</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">¿Qué son las cookies?</h2>
          <p>Las cookies son pequeños ficheros que se almacenan en tu dispositivo cuando visitas una web. Diime utiliza cookies propias y de terceros para mejorar tu experiencia.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Tipos de cookies que usamos</h2>
          <p><strong>Cookies técnicas (necesarias):</strong> Imprescindibles para el funcionamiento de la plataforma (autenticación, sesión de usuario, carrito de escrow).</p>
          <p className="mt-2"><strong>Cookies analíticas:</strong> Usamos Vercel Analytics para entender cómo se usa la plataforma de forma agregada y anónima.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Cómo desactivar las cookies</h2>
          <p>Puedes configurar tu navegador para rechazar cookies. Ten en cuenta que desactivar cookies técnicas puede afectar al funcionamiento de la plataforma.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Contacto</h2>
          <p>Para cualquier consulta sobre el uso de cookies escríbenos a <a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a>.</p>
        </section>
      </div>
    </div>
  )
}
