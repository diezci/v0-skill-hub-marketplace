import { getT } from "@/lib/i18n-servidor"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Política de privacidad | Diime"),
  }
}

export default async function Privacidad() {
  const { t } = await getT()

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">{t("Política de privacidad")}</h1>
      <p className="text-sm text-muted-foreground mb-10">{t("Última actualización: septiembre 2026")}</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("1. Responsable del tratamiento")}</h2>
          <p>
            {t("Juan Díez García, con domicilio de contacto en Calle Velázquez 83, 1.º izquierda, Madrid, España, es el responsable del tratamiento de los datos personales recogidos a través de Diime. Puedes contactar en")}<a href="mailto:contacto@diime.es" className="text-primary hover:underline"> contacto@diime.es</a> {" "}{t("o en el")}<a href="tel:+34657738042" className="text-primary hover:underline"> +34 657 738 042</a>{t(". El tratamiento se realiza de conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("2. Datos que recogemos")}</h2>
          <p>
            {t("Recogemos nombre, apellidos, email, teléfono, DNI/NIE, provincia o ubicación indicada manualmente, foto de perfil, datos de empresa cuando corresponda, confirmaciones legales, contenido publicado, mensajes, archivos, eventos del calendario de Diime, incidencias, valoraciones e historial de transacciones. Para acreditar el requisito de edad guardamos la fecha y la versión del texto que confirmaste; no te pedimos ni almacenamos tu fecha de nacimiento. También se generan datos técnicos necesarios para prestar y proteger el servicio, como dirección IP, tipo de dispositivo, páginas solicitadas y registros de error. En la app móvil se generan identificadores de instalación y tokens de notificaciones. Cuando activas los avisos con una sesión iniciada, el token se asocia a tu cuenta para enviarte mensajes, ofertas y novedades de tus trabajos; no se utiliza como identificador publicitario.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("3. Finalidad del tratamiento")}</h2>
          <p>{t("Los datos se utilizan para: gestionar tu cuenta, procesar pagos, verificar identidades, conectar clientes con profesionales, moderar contenido y prevenir fraude, enviar comunicaciones relacionadas con el servicio, atender incidencias y cumplir obligaciones legales.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("4. Tus derechos")}</h2>
          <p>{t("Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a")}{" "}<a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a>.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("5. Conservación de datos")}</h2>
          <p>{t("Conservamos tus datos mientras mantengas tu cuenta activa o durante el tiempo necesario para cumplir las finalidades descritas. Tras la baja se eliminan el acceso y la presencia pública. Los registros de contratos, pagos, facturas, fraude, disputas o reclamaciones se conservan solo durante los plazos legales aplicables.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("6. Proveedores")}</h2>
          <p>
            {t("Diime utiliza proveedores necesarios para prestar el servicio: Supabase para autenticación y base de datos, Stripe para pagos, Vercel para alojamiento, archivos y registros técnicos, Resend para comunicaciones transaccionales, Firebase Cloud Messaging de Google para notificaciones Android y Apple Push Notification service para notificaciones iOS. Los servicios de notificaciones reciben el identificador de destino y el contenido del aviso, que puede incluir el remitente y una vista previa de un mensaje. Cada proveedor recibe únicamente los datos necesarios para su función y está sujeto a sus obligaciones contractuales y de privacidad. Stripe recoge los datos de tarjeta en su propio formulario; Diime recibe el identificador y el estado de la transacción, pero no el número completo de la tarjeta.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("7. Eliminación y opciones de privacidad")}</h2>
          <p>{t("Puedes eliminar tu cuenta directamente desde Configuración o iniciar el proceso en")}{" "}<a href="/eliminar-cuenta" className="text-primary hover:underline">diime.es/eliminar-cuenta</a>{t(". También puedes contactar con")}{" "}<a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a> {" "}{t("para ejercer tus derechos o pedir ayuda.")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">{t("8. Seguimiento y permisos del dispositivo")}</h2>
          <p>
            {t("Diime no utiliza los datos para rastrearte entre aplicaciones o sitios de otras empresas, no muestra publicidad y no vende datos personales. La app no solicita ubicación GPS; la provincia se introduce manualmente. En Android se utilizan permisos de Internet, estado de red, vibración, recepción de notificaciones y actualización del contador del icono. Puedes desactivar las notificaciones en los ajustes del sistema; en las versiones que lo requieren se solicita permiso para mostrarlas. No se solicita acceso persistente a toda la biblioteca de fotos. Los archivos o imágenes solo se transmiten cuando la persona los selecciona o captura expresamente para adjuntarlos.")}</p>
        </section>
      </div>
    </div>
  )
}
