import { AvisoSinCobertura } from "@/components/aviso-sin-cobertura"

// La página de Gestión de proyectos es un componente de cliente entero, así que
// el aviso —que necesita leer la sesión en el servidor— se cuela por aquí, sin
// tener que partir la página en dos.
export default function MisTrabajosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="container mx-auto px-4 pt-8">
        <AvisoSinCobertura />
      </div>
      {children}
    </>
  )
}
