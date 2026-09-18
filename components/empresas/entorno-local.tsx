"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FlaskConical, Loader2, ArrowUpRight } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import type { ActorEmpresa } from "@/lib/empresas/types"

const actores = [
  ["owner", "Javier · Responsable principal"],
  ["ana", "Ana · Administradora"],
  ["mario", "Mario · Miembro"],
  ["cliente", "Cliente"],
  ["admin", "Diime · Revisión"],
  ["invitado", "Elena · Persona invitada"],
]

/** La identidad de prueba solo existe cuando el servidor habilita el modo local. */
export function EntornoEmpresasLocal({ actor }: { actor: ActorEmpresa }) {
  const t = useT()
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState("")
  const cambiar = (actorId: string) => {
    setError("")
    startTransition(async () => {
      try {
        const response = await fetch("/api/local/empresas/session", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorId }),
        })
        if (!response.ok) throw new Error(t("No se pudo cambiar la cuenta de prueba."))
        router.refresh()
      } catch (error) { setError(error instanceof Error ? error.message : t("No se pudo cambiar la cuenta.")) }
    })
  }
  return (
    <aside aria-label={t("Entorno local de empresas")} className="border-b border-amber-500/20 bg-amber-500/5">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div><span className="font-medium text-foreground">{t("Entorno local")}</span><span className="mx-1.5">·</span>{t("Datos de prueba guardados en este ordenador")}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/empresa/reformas-garcia" className="inline-flex items-center gap-1 text-primary hover:underline">{t("Ver empresa")}<ArrowUpRight className="h-3 w-3" /></Link>
              <Link href="/profesional/ana" className="inline-flex items-center gap-1 text-primary hover:underline">{t("Ver profesional")}<ArrowUpRight className="h-3 w-3" /></Link>
              <Link href="/mi-empresa" className="inline-flex items-center gap-1 text-primary hover:underline">{t("Mi empresa")}<ArrowUpRight className="h-3 w-3" /></Link>
            </div>
          </div>
        </div>
        <label className="flex max-w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Ver como")}
          <select aria-label={t("Cuenta de prueba")} value={actor.id} disabled={pendiente} onChange={(event) => cambiar(event.target.value)} className="h-10 max-w-full rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline-primary">
            {actores.map(([id, texto]) => <option key={id} value={id}>{t(texto)}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
      </div>
    </aside>
  )
}
