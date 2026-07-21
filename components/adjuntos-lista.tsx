import { FileText, ImageIcon } from "lucide-react"

const ES_IMAGEN = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i

// Vercel Blob sube los ficheros con addRandomSuffix, que añade 30 caracteres
// aleatorios antes de la extensión ("presupuesto-eWbfxAvt...QvW.pdf"). Sin
// quitarlo, el nombre que ve el usuario es ilegible.
const SUFIJO_BLOB = /-[A-Za-z0-9]{30}(?=\.[^.]+$)/

export function nombreDeAdjunto(url: string, indice: number): string {
  try {
    const base = decodeURIComponent(url.split("/").pop()?.split("?")[0] || "")
    const limpio = base.replace(SUFIJO_BLOB, "").trim()
    return limpio || `Archivo ${indice + 1}`
  } catch {
    return `Archivo ${indice + 1}`
  }
}

/**
 * Lista de archivos adjuntos (de una oferta o de una demanda).
 *
 * Las miniaturas van con object-contain sobre un fondo neutro: con object-cover
 * una captura de pantalla se recortaba por el centro y se veía un trozo de texto
 * suelto, sin forma de saber qué era. Cada adjunto muestra además su nombre, así
 * que también se distingue sin abrirlo.
 */
export function AdjuntosLista({ archivos }: { archivos: string[] }) {
  if (!Array.isArray(archivos) || archivos.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {archivos.map((url, i) => {
        const nombre = nombreDeAdjunto(url, i)
        const esImagen = ES_IMAGEN.test(url)

        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={nombre}
            // El ancho máximo va en rem, no en porcentaje: un max-width en % no
            // acota el ancho intrínseco, así que un nombre largo (las capturas
            // traen fecha y hora) ensanchaba la tarjeta que contiene la lista y
            // la desbordaba en móvil.
            className="group flex items-center gap-2 rounded-md border p-1.5 pr-2.5 max-w-[13rem] hover:bg-muted transition"
          >
            {esImagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={nombre}
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded bg-muted object-contain"
              />
            ) : (
              <span className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs truncate group-hover:underline">{nombre}</span>
              <span className="block text-[11px] text-muted-foreground flex items-center gap-1">
                {esImagen ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                {esImagen ? "Imagen" : "Documento"}
              </span>
            </span>
          </a>
        )
      })}
    </div>
  )
}
