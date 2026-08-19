import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de privacidad | Diime",
}

export default function Privacidad() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Política de privacidad</h1>
      <p className="text-sm text-muted-foreground mb-10">Última actualización: agosto 2026</p>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Responsable del tratamiento</h2>
          <p>Diime (contacto@diime.es) es el responsable del tratamiento de los datos personales recogidos a través de esta plataforma, de conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Datos que recogemos</h2>
          <p>Recogemos: nombre, apellidos, email, teléfono, DNI/NIE, ubicación, foto de perfil, historial de transacciones y valoraciones. También recogemos datos técnicos de uso de la plataforma (dirección IP, tipo de dispositivo, páginas visitadas).</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Finalidad del tratamiento</h2>
          <p>Los datos se utilizan para: gestionar tu cuenta, procesar pagos, verificar identidades, conectar clientes con profesionales, moderar contenido y prevenir fraude, enviar comunicaciones relacionadas con el servicio, atender incidencias y cumplir obligaciones legales.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Tus derechos</h2>
          <p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a>.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Conservación de datos</h2>
          <p>Conservamos tus datos mientras mantengas tu cuenta activa o durante el tiempo necesario para cumplir las finalidades descritas. Tras la baja se eliminan el acceso y la presencia pública. Los registros de contratos, pagos, facturas, fraude, disputas o reclamaciones se conservan solo durante los plazos legales aplicables.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Proveedores</h2>
          <p>Diime utiliza proveedores necesarios para prestar el servicio, entre ellos Supabase para autenticación y base de datos, Stripe para pagos, Vercel para alojamiento y analítica técnica, y Resend para comunicaciones transaccionales. Cada proveedor recibe únicamente los datos necesarios para su función y está sujeto a sus obligaciones contractuales y de privacidad.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Eliminación y opciones de privacidad</h2>
          <p>Puedes eliminar tu cuenta directamente desde Configuración o iniciar el proceso en <a href="/eliminar-cuenta" className="text-primary hover:underline">diime.es/eliminar-cuenta</a>. También puedes contactar con <a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a> para ejercer tus derechos o pedir ayuda.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Seguimiento y permisos del dispositivo</h2>
          <p>Diime no utiliza los datos para rastrearte entre aplicaciones o sitios de otras empresas y no vende datos personales. La app no solicita ubicación GPS; la provincia se introduce manualmente. Los archivos o imágenes solo se comparten cuando la persona los selecciona expresamente.</p>
        </section>
      </div>
    </div>
  )
}
