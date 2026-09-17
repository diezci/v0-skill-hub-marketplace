"use client"

import { Languages } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IDIOMAS, esIdiomaValido } from "@/lib/i18n"

export function SelectorIdioma({ compacto = false }: { compacto?: boolean }) {
  const { idioma, cambiarIdioma, t } = useIdioma()

  if (compacto) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label={t("nav.idioma")}
            title={`${t("nav.idioma")}: ${IDIOMAS.find(({ id }) => id === idioma)?.etiqueta}`}
          >
            <Languages className="h-[1.2rem] w-[1.2rem]" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("nav.idioma")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={idioma}
            onValueChange={(valor) => {
              if (esIdiomaValido(valor)) cambiarIdioma(valor)
            }}
          >
            {IDIOMAS.map(({ id, etiqueta }) => (
              <DropdownMenuRadioItem key={id} value={id} lang={id}>
                {etiqueta}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-sm">
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{t("nav.idioma")}</span>
      <select
        aria-label={t("nav.idioma")}
        value={idioma}
        onChange={(event) => {
          if (esIdiomaValido(event.target.value)) cambiarIdioma(event.target.value)
        }}
        className="max-w-24 bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {IDIOMAS.map(({ id, etiqueta }) => <option key={id} value={id} lang={id}>{etiqueta}</option>)}
      </select>
    </label>
  )
}
