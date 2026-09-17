import { getT } from "@/lib/i18n-servidor"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Aviso legal | Diime"),
    description: t("Información legal y de contacto de Diime."),
  }
}

export default async function AvisoLegal() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">{t("Aviso legal")}</h1>
      <p className="text-sm text-muted-foreground mb-10">{t("Última actualización: agosto de 2026")}</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("1. Titular del sitio y del servicio")}</h2>
          <p>
            {t("En cumplimiento del deber de información aplicable, se facilitan los datos de contacto del titular de Diime y del dominio diime.es:")}</p>
          <ul className="list-disc pl-6 mt-3 space-y-1">
            <li>{t("Nombre: Juan Díez García")}</li>
            <li>{t("Domicilio de contacto: Calle Velázquez 83, 1.º izquierda, Madrid, España")}</li>
            <li>{t("Correo electrónico:")}{" "}<a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a></li>
            <li>{t("Teléfono:")}{" "}<a href="tel:+34657738042" className="text-primary hover:underline">+34 657 738 042</a></li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("2. Objeto de Diime")}</h2>
          <p>
            {t("Diime es una plataforma de intermediación que permite a clientes y profesionales ponerse en contacto, publicar y comparar propuestas, comunicarse y gestionar servicios. Salvo que se indique expresamente lo contrario, Diime no presta el servicio profesional contratado ni es parte del contrato celebrado entre cliente y profesional.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("3. Condiciones de uso")}</h2>
          <p>
            {t("El acceso a este sitio implica utilizarlo de forma lícita, diligente y conforme a los")}<a href="/legal/terminos" className="text-primary hover:underline"> {" "}{t("Términos y condiciones")}</a> {" "}{t("y a las")}<a href="/legal/normas-comunidad" className="text-primary hover:underline"> {" "}{t("Normas de la comunidad")}</a>{t(". Queda prohibido dañar, sobrecargar o interferir en el servicio, suplantar identidades o utilizarlo para actividades ilícitas o que vulneren derechos de terceros.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("4. Propiedad intelectual")}</h2>
          <p>
            {t("Los textos, diseños, marcas, código y demás elementos propios de Diime están protegidos por la normativa de propiedad intelectual e industrial. Los contenidos publicados por los usuarios pertenecen a sus respectivos titulares y se utilizan únicamente en la medida necesaria para prestar y moderar el servicio.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("5. Responsabilidad y enlaces")}</h2>
          <p>
            {t("Diime aplica medidas razonables para mantener la plataforma disponible y segura, pero no garantiza la disponibilidad ininterrumpida ni la exactitud de la información aportada por terceros. Los enlaces externos se facilitan como referencia y sus contenidos y políticas son responsabilidad de sus titulares.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("6. Legislación aplicable")}</h2>
          <p>
            {t("Este aviso se rige por la legislación española. Cuando la normativa de consumo no determine otro fuero imperativo, las controversias se someterán a los juzgados y tribunales competentes de Madrid.")}</p>
        </section>
      </div>
    </div>
  )
}
