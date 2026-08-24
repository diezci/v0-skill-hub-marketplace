import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Términos y condiciones | Diime",
}

export default function Terminos() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Términos y condiciones</h1>
      <p className="text-sm text-muted-foreground mb-10">Última actualización: agosto 2026</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Aceptación de los términos</h2>
          <p>Al acceder y utilizar Diime (diime.es), aceptas quedar vinculado por estos Términos y Condiciones. Si no estás de acuerdo con alguno de estos términos, te pedimos que no utilices nuestros servicios.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Descripción del servicio</h2>
          <p>Diime es una plataforma de intermediación que conecta a particulares y empresas que necesitan servicios profesionales (clientes) con profesionales autónomos o empresas que ofrecen dichos servicios (proveedores). Diime no es parte en los contratos de servicios que se celebran entre clientes y proveedores.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Registro y cuenta de usuario</h2>
          <p>
            Para registrarte y utilizar Diime debes tener al menos 18 años y capacidad legal para contratar. Si actúas
            por una empresa, debes estar autorizado para representarla. Durante el alta se te pedirá una confirmación
            expresa de mayoría de edad; las cuentas no pueden ser utilizadas por menores. El usuario se compromete a
            proporcionar información veraz, actual y completa, mantenerla actualizada y proteger la confidencialidad de
            su contraseña.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Sistema de pagos escrow</h2>
          <p>Diime utiliza un sistema de pagos escrow para proteger las transacciones. El cliente realiza el pago antes del inicio del trabajo. Diime retiene el importe de forma segura y lo libera al proveedor cuando el cliente confirma la correcta finalización del trabajo o transcurrido el plazo de verificación.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Comisiones</h2>
          <p>Diime aplica una comisión sobre el valor de cada transacción completada. El porcentaje de comisión vigente se indica en la plataforma antes de confirmar cada operación. Las comisiones están sujetas a cambios con previo aviso de 30 días.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Cancelaciones y reembolsos</h2>
          <p>Las condiciones de cancelación y reembolso dependen del estado del trabajo. Antes del inicio, el cliente puede cancelar y recibir un reembolso completo. Una vez iniciado el trabajo, la política de reembolso se aplica de forma proporcional al trabajo realizado, según lo acordado entre las partes.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Contenido y conducta de los usuarios</h2>
          <p>
            Al publicar perfiles, demandas, ofertas, mensajes, archivos o valoraciones aceptas las Normas de la
            comunidad. No se permite contenido ilegal, fraudulento, sexual explícito, violento, discriminatorio,
            amenazante, que vulnere derechos de terceros o que exponga datos personales sin autorización. Diime puede
            filtrar, ocultar o retirar contenido y limitar o cerrar cuentas cuando sea necesario para proteger a la
            comunidad o cumplir la ley.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Reportes y bloqueo</h2>
          <p>
            Los usuarios pueden reportar contenido o conductas desde la plataforma y bloquear a otras personas para
            impedir nuevas comunicaciones. Diime revisará los reportes y podrá solicitar información adicional. Las
            reglas completas se encuentran en las <a href="/legal/normas-comunidad" className="text-primary hover:underline">Normas de la comunidad</a>.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Baja y eliminación de cuenta</h2>
          <p>
            Puedes iniciar la eliminación desde Configuración → Eliminar mi cuenta o desde la página pública de
            eliminación. Se retirará tu presencia pública y se suprimirán los datos que no debamos conservar por
            obligaciones legales, contables, prevención del fraude o defensa frente a reclamaciones. Antes de confirmar
            se explicarán las consecuencias sobre trabajos, pagos o disputas pendientes.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">10. Contacto</h2>
          <p>
            Para cualquier consulta relacionada con estos términos, puedes escribir a
            <a href="mailto:contacto@diime.es" className="text-primary hover:underline"> contacto@diime.es</a>. La
            información general del servicio se encuentra en el
            <a href="/legal/aviso-legal" className="text-primary hover:underline"> Aviso legal</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
