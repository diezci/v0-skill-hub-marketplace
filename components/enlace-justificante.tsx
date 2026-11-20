"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Capacitor } from "@capacitor/core"

/** Los justificantes necesitan la sesión de la app, que el navegador externo no comparte. */
export function EnlaceJustificante({
  trabajoId,
  className,
  children,
}: {
  trabajoId: string
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const href = `/trabajos/${trabajoId}/factura`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => {
        if (!Capacitor.isNativePlatform()) return
        event.preventDefault()
        router.push(href)
      }}
    >
      {children}
    </a>
  )
}
