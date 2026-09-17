"use client"

import { useT } from "@/components/idioma-provider"

import { Share2 } from "lucide-react"
import { usePathname } from "next/navigation"
import { Share } from "@capacitor/share"

export function NativeShareAction() {
  const t = useT()
  const pathname = usePathname()
  if (!pathname?.startsWith("/profesional/")) return null

  const compartir = async () => {
    try {
      await Share.share({
        title: t("Perfil profesional en Diime"),
        text: t("Consulta este perfil profesional en Diime"),
        url: window.location.href,
        dialogTitle: t("Compartir perfil"),
      })
    } catch {
      // Cerrar la hoja de compartir es una cancelación, no un error.
    }
  }

  return (
    <button type="button" className="native-only native-share-action" onClick={compartir} data-native-haptic aria-label={t("Compartir perfil")}>
      <Share2 aria-hidden="true" />
    </button>
  )
}
