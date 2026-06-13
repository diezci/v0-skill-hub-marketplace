import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SearchX, ArrowLeft } from "lucide-react"

export default function ProfesionalNoEncontrado() {
  return (
    <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center text-center">
      <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <SearchX className="h-10 w-10 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold mb-3">Profesional no encontrado</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        El perfil que buscas no existe o ha sido eliminado. Puedes explorar otros profesionales disponibles.
      </p>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al inicio
          </Link>
        </Button>
        <Button asChild>
          <Link href="/profesionales">Ver profesionales</Link>
        </Button>
      </div>
    </div>
  )
}
