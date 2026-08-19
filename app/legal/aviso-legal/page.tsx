import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Aviso legal | Diime",
  description: "Información legal e identificación del titular de Diime.",
}

export default function AvisoLegal() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Aviso legal</h1>
      <p className="text-sm text-muted-foreground mb-10">Última actualización: agosto de 2026</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Titular del sitio y del servicio</h2>
          <p>
            En cumplimiento del deber de información aplicable, se facilitan los datos identificativos del titular de
            Diime y del dominio diime.es:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>Nombre: Juan Díez García</li>
            <li>Domicilio: Calle Pedro Muguruza 8, 2.º B, 28036 Madrid, España</li>
            <li>Correo electrónico: <a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a></li>
            <li>Teléfono: <a href="tel:+34657738042" className="text-primary hover:underline">+34 657 738 042</a></li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Objeto de Diime</h2>
          <p>
            Diime es una plataforma de intermediación que permite a clientes y profesionales ponerse en contacto,
            publicar y comparar propuestas, comunicarse y gestionar servicios. Salvo que se indique expresamente lo
            contrario, Diime no presta el servicio profesional contratado ni es parte del contrato celebrado entre
            cliente y profesional.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Condiciones de uso</h2>
          <p>
            El acceso a este sitio implica utilizarlo de forma lícita, diligente y conforme a los
            <a href="/legal/terminos" className="text-primary hover:underline"> Términos y condiciones</a> y a las
            <a href="/legal/normas-comunidad" className="text-primary hover:underline"> Normas de la comunidad</a>.
            Queda prohibido dañar, sobrecargar o interferir en el servicio, suplantar identidades o utilizarlo para
            actividades ilícitas o que vulneren derechos de terceros.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Propiedad intelectual</h2>
          <p>
            Los textos, diseños, marcas, código y demás elementos propios de Diime están protegidos por la normativa de
            propiedad intelectual e industrial. Los contenidos publicados por los usuarios pertenecen a sus respectivos
            titulares y se utilizan únicamente en la medida necesaria para prestar y moderar el servicio.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Responsabilidad y enlaces</h2>
          <p>
            Diime aplica medidas razonables para mantener la plataforma disponible y segura, pero no garantiza la
            disponibilidad ininterrumpida ni la exactitud de la información aportada por terceros. Los enlaces externos
            se facilitan como referencia y sus contenidos y políticas son responsabilidad de sus titulares.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Legislación aplicable</h2>
          <p>
            Este aviso se rige por la legislación española. Cuando la normativa de consumo no determine otro fuero
            imperativo, las controversias se someterán a los juzgados y tribunales competentes de Madrid.
          </p>
        </section>
      </div>
    </div>
  )
}
