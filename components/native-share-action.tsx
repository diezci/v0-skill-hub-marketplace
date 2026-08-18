"use client"

import { Share2 } from "lucide-react"
import { usePathname } from "next/navigation"
import { Share } from "@capacitor/share"

export function NativeShareAction() {
  const pathname = usePathname()
  if (!pathname?.startsWith("/profesional/")) return null

  const compartir = async () => {
    try {
      await Share.share({
        title: "Perfil profesional en Diime",
        text: "Consulta este perfil profesional en Diime",
        url: window.location.href,
        dialogTitle: "Compartir perfil",
      })
    } catch {
      // Cerrar la hoja de compartir es una cancelación, no un error.
    }
  }

  return (
    <button type="button" className="native-only native-share-action" onClick={compartir} data-native-haptic aria-label="Compartir perfil">
      <Share2 aria-hidden="true" />
    </button>
  )
}
