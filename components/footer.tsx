import Link from "next/link"
import { Mail, Shield, Heart } from "lucide-react"
import { ReportarIncidenciaDialog } from "@/components/reportar-incidencia-dialog"

const Footer = () => {
  const links = {
    platform: [
      { name: "Buscar profesionales", href: "/profesionales" },
      { name: "Ver demandas", href: "/demandas" },
      { name: "Publicar proyecto", href: "/solicitar-servicio" },
    ],
    professionals: [
      { name: "Crear perfil", href: "/convertirse-profesional" },
      { name: "Mis trabajos", href: "/mis-trabajos" },
      { name: "Calendario", href: "/mi-calendario" },
      { name: "Mensajes", href: "/mensajes" },
    ],
    company: [
      { name: "Sobre nosotros", href: "#" },
      { name: "Contacto", href: "mailto:contacto@diime.es" },
      { name: "Centro de ayuda", href: "#" },
    ],
    legal: [
      { name: "Terminos y condiciones", href: "#" },
      { name: "Politica de privacidad", href: "#" },
      { name: "Politica de cookies", href: "#" },
    ],
  }

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">D</span>
              </div>
              <span className="font-bold text-lg">Diime</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-xs">
              La plataforma que conecta profesionales cualificados con clientes que buscan calidad y confianza.
            </p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a
                href="mailto:contacto@diime.es"
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                contacto@diime.es
              </a>
              <span className="inline-flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Pagos protegidos con escrow
              </span>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4 text-sm">Plataforma</h4>
            <ul className="space-y-2.5">
              {links.platform.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Profesionales</h4>
            <ul className="space-y-2.5">
              {links.professionals.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Empresa</h4>
            <ul className="space-y-2.5">
              {links.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Legal</h4>
            <ul className="space-y-2.5">
              {links.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Diime. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-3">
            <ReportarIncidenciaDialog />
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              Hecho con <Heart className="h-3.5 w-3.5 fill-primary text-primary" /> en España
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

export { Footer }
export default Footer
