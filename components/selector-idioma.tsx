"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages, Check } from "lucide-react"
import { IDIOMAS } from "@/lib/i18n"
import { useIdioma } from "@/components/idioma-provider"

export function SelectorIdioma() {
  const { idioma, cambiarIdioma, t } = useIdioma()
  const actual = IDIOMAS.find((i) => i.id === idioma) ?? IDIOMAS[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label={t("nav.idioma")}>
          <Languages className="h-4 w-4" />
          <span className="text-xs font-medium">{actual.corto}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {IDIOMAS.map((i) => (
          <DropdownMenuItem key={i.id} onClick={() => cambiarIdioma(i.id)} className="gap-2">
            {i.etiqueta}
            {i.id === idioma && <Check className="h-3.5 w-3.5 ml-auto text-emerald-600 dark:text-emerald-400" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
