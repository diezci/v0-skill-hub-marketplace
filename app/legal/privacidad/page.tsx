import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de privacidad | Diime",
}

export default function Privacidad() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Política de privacidad</h1>
      <p className="text-sm text-muted-foreground mb-10">Última actualización: junio 2026</p>
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
          <p>Los datos se utilizan para: gestionar tu cuenta, procesar pagos, verificar identidades, conectar clientes con profesionales, enviar comunicaciones relacionadas con el servicio y cumplir obligaciones legales.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Tus derechos</h2>
          <p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <a href="mailto:contacto@diime.es" className="text-primary hover:underline">contacto@diime.es</a>.</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Conservación de datos</h2>
          <p>Conservamos tus datos mientras mantengas tu cuenta activa o el tiempo necesario para cumplir las finalidades descritas y las obligaciones legales aplicables.</p>
        </section>
      </div>
    </div>
  )
}
