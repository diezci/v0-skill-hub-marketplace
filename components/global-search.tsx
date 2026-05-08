"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, Briefcase, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

interface SearchResult {
  id: string
  type: "profesional" | "categoria" | "solicitud"
  title: string
  subtitle?: string
  link: string
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()

      try {
        const [profesionales, categorias, solicitudes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, nombre, apellido, ubicacion, tipo_usuario")
            .ilike("nombre", `%${query}%`)
            .eq("tipo_usuario", "profesional")
            .limit(5),
          supabase
            .from("categorias")
            .select("id, nombre")
            .ilike("nombre", `%${query}%`)
            .limit(5),
          supabase
            .from("solicitudes")
            .select("id, titulo, ubicacion")
            .ilike("titulo", `%${query}%`)
            .eq("estado", "abierta")
            .limit(5),
        ])

        const combined: SearchResult[] = [
          ...(profesionales.data || []).map((p: any) => ({
            id: p.id,
            type: "profesional" as const,
            title: `${p.nombre || ""} ${p.apellido || ""}`.trim() || "Profesional",
            subtitle: p.ubicacion || undefined,
            link: `/profesional/${p.id}`,
          })),
          ...(categorias.data || []).map((c: any) => ({
            id: c.id,
            type: "categoria" as const,
            title: c.nombre,
            subtitle: "Ver profesionales en esta categoria",
            link: `/profesionales?categoria=${encodeURIComponent(c.nombre)}`,
          })),
          ...(solicitudes.data || []).map((s: any) => ({
            id: s.id,
            type: "solicitud" as const,
            title: s.titulo,
            subtitle: s.ubicacion || undefined,
            link: `/demandas`,
          })),
        ]

        setResults(combined)
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timeout)
  }, [query])

  const iconForType = {
    profesional: Briefcase,
    categoria: Search,
    solicitud: FileText,
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden lg:inline-flex relative h-9 w-full max-w-xs justify-start text-sm text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4 mr-2" />
        Buscar profesionales, servicios...
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">Ctrl</span>K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
      >
        <Search className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0 gap-0 top-[20%] translate-y-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Buscador global</DialogTitle>
            <DialogDescription>Busca profesionales, categorias y demandas</DialogDescription>
          </DialogHeader>
          <div className="flex items-center border-b px-4">
            <Search className="size-4 text-muted-foreground mr-3" />
            <Input
              autoFocus
              placeholder="Buscar profesionales, categorias, demandas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 shadow-none px-0 h-12"
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {!query && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Empieza a escribir para buscar...
              </div>
            )}
            {query && !loading && results.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Sin resultados para &quot;{query}&quot;
              </div>
            )}
            {results.length > 0 && (
              <div className="py-2">
                {results.map((r) => {
                  const Icon = iconForType[r.type]
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => {
                        router.push(r.link)
                        setOpen(false)
                        setQuery("")
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted text-left transition-colors"
                    >
                      <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Icon className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        {r.subtitle && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            {r.type === "profesional" && r.subtitle && <MapPin className="size-3" />}
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize hidden sm:inline">
                        {r.type}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
