"use client"

import type { ReactNode } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"

export function EditarSeccionEmpresa({ children, onEditar }: { children: ReactNode; onEditar: () => void }) {
  return <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs font-medium text-primary" onClick={onEditar}>
    <Pencil className="size-3.5" aria-hidden="true" />{children}
  </Button>
}
