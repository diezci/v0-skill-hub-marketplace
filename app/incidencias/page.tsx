import MisIncidencias from "@/components/mis-incidencias"

export const metadata = {
  title: "Incidencias | Diime",
  description: "Reporta problemas y sigue el estado de tus incidencias con el equipo de Diime",
}

export default function IncidenciasPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Incidencias</h1>
        <p className="text-muted-foreground">
          Reporta problemas con pagos, trabajos u otros usuarios y sigue aquí el estado de cada incidencia. Nuestro
          equipo las revisa y responde.
        </p>
      </div>
      <MisIncidencias />
    </div>
  )
}
