"use client"

import { useId, useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const etiquetas = {
  es: { mostrar: "Mostrar contraseña", ocultar: "Ocultar contraseña" },
  en: { mostrar: "Show password", ocultar: "Hide password" },
} as const

type PasswordInputProps = Omit<ComponentProps<"input">, "type">

export function PasswordInput({ id, className, disabled, ...props }: PasswordInputProps) {
  const { idioma } = useIdioma()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)
  const label = visible ? etiquetas[idioma].ocultar : etiquetas[idioma].mostrar

  return (
    <div className="relative">
      <Input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn("min-h-11 pr-12", className)}
      />
      <button
        type="button"
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        aria-label={label}
        aria-pressed={visible}
        aria-controls={inputId}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((previous) => !previous)}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
}
