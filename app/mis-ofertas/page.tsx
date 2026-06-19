import MisOfertas from "@/components/mis-ofertas"

export const metadata = {
  title: "Mis Ofertas | Diime",
  description: "Gestiona las ofertas que has enviado: edítalas o retíralas mientras no hayan sido aceptadas",
}

export default function MisOfertasPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mis Ofertas</h1>
        <p className="text-muted-foreground">
          Gestiona las ofertas que has enviado a los clientes. Puedes editarlas o retirarlas mientras no hayan sido
          aceptadas.
        </p>
      </div>
      <MisOfertas />
    </div>
  )
}
