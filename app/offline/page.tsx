import { getT } from "@/lib/i18n-servidor"
import { WifiOff } from "lucide-react"

export async function generateMetadata() {
  const { t } = await getT()
  return {
    title: t("Sin conexión | Diime"),
}
}

// Página que muestra el service worker cuando no hay red y la ruta pedida no
// está en caché. Sin datos ni sesión: tiene que poder renderizarse sola.
export default async function SinConexion() {
  const { t } = await getT()

  return (
    <div className="container mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="mb-2 text-2xl font-bold">{t("Sin conexión")}</h1>
      <p className="text-muted-foreground">
        {t("No hemos podido conectar con Diime. Comprueba tu conexión: en cuanto vuelva, esta pantalla se actualiza sola al recargar.")}</p>
    </div>
  )
}
