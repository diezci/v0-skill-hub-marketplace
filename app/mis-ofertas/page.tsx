import MisOfertas from "@/components/mis-ofertas"

export const metadata = {
  title: "Mis Pujas | Diime",
  description: "Gestiona las pujas que has enviado: edítalas o retíralas mientras no hayan sido aceptadas",
}

export default function MisPujasPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mis Pujas</h1>
        <p className="text-muted-foreground">
          Gestiona las pujas que has enviado a los clientes. Puedes editarlas o retirarlas mientras no hayan sido
          aceptadas.
        </p>
      </div>
      <MisOfertas />
    </div>
  )
}
