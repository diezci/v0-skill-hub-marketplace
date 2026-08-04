import Link from "next/link"

// Envuelve el nombre (y la foto) de un usuario para que lleve a su perfil.
//
// Siempre a /usuario/[id], nunca a /profesional/[id]: la persona puede ser un
// cliente, y esa ruta da 404 con quien no tiene ficha profesional. /usuario
// redirige a la ficha profesional cuando corresponde.
//
// Si no hay id (datos incompletos) se pinta el contenido sin enlace, para no
// dejar un enlace roto.
export function EnlacePerfil({
  usuarioId,
  className,
  children,
}: {
  usuarioId?: string | null
  className?: string
  children: React.ReactNode
}) {
  if (!usuarioId) return <>{children}</>

  return (
    <Link
      href={`/usuario/${usuarioId}`}
      className={`hover:text-primary hover:underline underline-offset-2 transition-colors ${className ?? ""}`}
    >
      {children}
    </Link>
  )
}
