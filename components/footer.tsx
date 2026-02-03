import Link from "next/link"

const Footer = () => {
  const links = {
    platform: [
      { name: "Buscar profesionales", href: "/gigs" },
      { name: "Publicar proyecto", href: "/solicitar-servicio" },
      { name: "Cómo funciona", href: "/#como-funciona" },
    ],
    professionals: [
      { name: "Crear perfil", href: "/convertirse-profesional" },
      { name: "Tarifas", href: "#" },
      { name: "Recursos", href: "#" },
    ],
    company: [
      { name: "Sobre nosotros", href: "#" },
      { name: "Blog", href: "#" },
      { name: "Contacto", href: "#" },
    ],
    legal: [
      { name: "Términos", href: "#" },
      { name: "Privacidad", href: "#" },
      { name: "Cookies", href: "#" },
    ],
  }

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">S</span>
              </div>
              <span className="font-semibold text-lg">SkillHub</span>
            </Link>
            <p className="text-sm text-muted-foreground">La plataforma que conecta profesionales con clientes.</p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4 text-sm">Plataforma</h4>
            <ul className="space-y-2">
              {links.platform.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Profesionales</h4>
            <ul className="space-y-2">
              {links.professionals.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Empresa</h4>
            <ul className="space-y-2">
              {links.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm">Legal</h4>
            <ul className="space-y-2">
              {links.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} SkillHub. Todos los derechos reservados.
          </p>
          <p className="text-sm text-muted-foreground">Hecho con cariño en España</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
