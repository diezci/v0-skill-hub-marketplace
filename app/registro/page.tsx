import type { Metadata } from "next"
import RegistroForm from "@/components/registro-form"

export const metadata: Metadata = {
  title: "Registro de Cliente | SkillHub",
  description: "Regístrate para encontrar y contratar profesionales de construcción y mejoras del hogar",
}

export default function RegistroPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-4">Crear Cuenta</h1>
        <p className="text-lg text-muted-foreground">
          Regístrate para encontrar y contratar a los mejores profesionales para tus proyectos
        </p>
      </div>
      <RegistroForm />
    </div>
  )
}
