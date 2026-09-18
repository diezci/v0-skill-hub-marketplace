import { getT } from "@/lib/i18n-servidor"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Términos y condiciones | Diime"),
  }
}

export default async function Terminos() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">{t("Términos y condiciones")}</h1>
      <p className="text-sm text-muted-foreground mb-10">{t("Última actualización: septiembre 2026")}</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("1. Aceptación de los términos")}</h2>
          <p>{t("Al acceder y utilizar Diime (diime.es), aceptas quedar vinculado por estos Términos y Condiciones. Si no estás de acuerdo con alguno de estos términos, te pedimos que no utilices nuestros servicios.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("2. Descripción del servicio")}</h2>
          <p>{t("Diime es una plataforma de intermediación que conecta a particulares y empresas que necesitan servicios profesionales (clientes) con profesionales autónomos o empresas que ofrecen dichos servicios (proveedores). Diime no es parte en los contratos de servicios que se celebran entre clientes y proveedores.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("3. Registro y cuenta de usuario")}</h2>
          <p>
            {t("Para registrarte y utilizar Diime debes tener al menos 18 años y capacidad legal para contratar. Si actúas por una empresa, debes estar autorizado para representarla. Durante el alta se te pedirá una confirmación expresa de mayoría de edad; las cuentas no pueden ser utilizadas por menores. El usuario se compromete a proporcionar información veraz, actual y completa, mantenerla actualizada y proteger la confidencialidad de su contraseña.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("4. Sistema de pago protegido")}</h2>
          <p>{t("El cliente paga antes del inicio del trabajo mediante Stripe. La transferencia al profesional queda aplazada y se ejecuta cuando el cliente confirma la correcta recepción o cuando Diime resuelve una disputa. Este servicio no constituye una cuenta escrow ni un depósito regulado. Los trabajos deben cerrarse dentro del plazo máximo que permita Stripe Connect.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("5. Comisiones")}</h2>
          <p>
            {t("Diime aplica gastos de servicio al pago de la contratación. El porcentaje vigente se indica en la plataforma antes de confirmar cada operación y el importe mostrado incluye el IVA aplicable a los servicios de Diime. En una cancelación de mutuo acuerdo de un trabajo pagado, Diime conserva los gastos de servicio del cliente cobrados al pagar. Las tarifas están sujetas a cambios con previo aviso de 30 días.")}</p>
          <p className="mt-3">
            {t("El proveedor fija el precio final de su servicio, incluyendo los impuestos que correspondan, y es el único responsable de determinar su tratamiento fiscal, emitir la factura al cliente y declarar e ingresar el IVA cuando resulte aplicable. Diime no calcula, retiene ni declara el IVA correspondiente al servicio prestado por el proveedor.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("6. Cancelaciones y reembolsos")}</h2>
          <p>{t("Cualquiera de las partes puede solicitar una cancelación de mutuo acuerdo antes de la entrega. Si la otra parte acepta y el trabajo ya estaba pagado, se devuelve al cliente el precio del servicio y Diime conserva los gastos de servicio del cliente cobrados al pagar. Si no se había pagado, no se mueve dinero. Si la cancelación se rechaza, se abre una disputa que resuelve Diime según los términos de la contratación y las pruebas aportadas.")}</p>
          <p className="mt-3">{t("Los pagos tardíos recibidos tras el cierre del intento de pago, sin que se active la contratación, se devuelven íntegramente, sin retener comisión. El justificante recoge los importes y el resultado de cada operación; los reembolsos ya ejecutados no se modifican.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("7. Contenido y conducta de los usuarios")}</h2>
          <p>
            {t("Al publicar perfiles, demandas, ofertas, mensajes, archivos o valoraciones aceptas las Normas de la comunidad. No se permite contenido ilegal, fraudulento, sexual explícito, violento, discriminatorio, amenazante, que vulnere derechos de terceros o que exponga datos personales sin autorización. Diime puede filtrar, ocultar o retirar contenido y limitar o cerrar cuentas cuando sea necesario para proteger a la comunidad o cumplir la ley.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("8. Reportes y bloqueo")}</h2>
          <p>
            {t("Los usuarios pueden reportar contenido o conductas desde la plataforma y bloquear a otras personas para impedir nuevas comunicaciones. Diime revisará los reportes y podrá solicitar información adicional. Las reglas completas se encuentran en las")}{" "}<a href="/legal/normas-comunidad" className="text-primary hover:underline">{t("Normas de la comunidad")}</a>.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("9. Baja y eliminación de cuenta")}</h2>
          <p>
            {t("Puedes iniciar la eliminación desde Configuración → Eliminar mi cuenta o desde la página pública de eliminación. Se retirará tu presencia pública y se suprimirán los datos que no debamos conservar por obligaciones legales, contables, prevención del fraude o defensa frente a reclamaciones. Antes de confirmar se explicarán las consecuencias sobre trabajos, pagos o disputas pendientes.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("10. Contacto")}</h2>
          <p>
            {t("Diime es un servicio titularidad de Juan Díez García. Para cualquier consulta relacionada con estos términos, puedes escribir a")}<a href="mailto:contacto@diime.es" className="text-primary hover:underline"> contacto@diime.es</a>{t(". Los datos de contacto del titular se encuentran en el")}<a href="/legal/aviso-legal" className="text-primary hover:underline"> {" "}{t("Aviso legal")}</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
