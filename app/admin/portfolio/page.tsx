"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { BadgeCheck, FileSearch, Loader2 } from "lucide-react"
import { listarAcreditacionesPortfolio, revisarAcreditacionPortfolio, type AcreditacionPortfolio } from "@/app/actions/portfolio-acreditacion"
import { useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const ESTADOS = { pendiente: "Pendiente de acreditar", acreditado: "Acreditado por Diime", requiere_informacion: "Necesita información" }
export default function PortfolioAdminPage() {
  const t = useT()
  const [items, setItems] = useState<AcreditacionPortfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [filtro, setFiltro] = useState("pendiente")
  const [actual, setActual] = useState<AcreditacionPortfolio | null>(null)
  const [nota, setNota] = useState("")
  const [comprobado, setComprobado] = useState(false)
  const [pending, startTransition] = useTransition()
  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listarAcreditacionesPortfolio()
      if (result.error) setError(result.error)
      else { setItems(result.data || []); setError("") }
    } catch { setError("No se pudieron cargar los proyectos.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  function revisar(decision: "acreditado" | "requiere_informacion") {
    if (!actual || pending) return
    setError(""); setMensaje("")
    startTransition(async () => {
      try {
        const result = await revisarAcreditacionPortfolio({ tipo: actual.tipo, itemId: actual.item_id, revisionId: actual.revision_id, decision, nota })
        if (result.error) { setError(result.error); return }
        setActual(null); setMensaje(decision === "acreditado" ? "Proyecto acreditado y disponible en el portfolio público." : "Información solicitada. El proyecto permanece privado.")
        await cargar()
      } catch { setError("No se pudo guardar la revisión.") }
    })
  }
  const visibles = items.filter(item => filtro === "todos" || item.estado === filtro)
  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header><h1 className="flex items-center gap-3 text-2xl font-semibold"><BadgeCheck className="size-6" />{t("Acreditación de portfolios")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Revisa los proyectos externos de profesionales y empresas. Los trabajos completados en Diime se acreditan mediante su contrato.")}</p></header>
    <div className="flex flex-wrap gap-2">{["pendiente", "requiere_informacion", "acreditado", "todos"].map(estado => <Button key={estado} size="sm" variant={filtro === estado ? "default" : "outline"} onClick={() => setFiltro(estado)}>{t(estado === "todos" ? "Todos" : ESTADOS[estado as keyof typeof ESTADOS])}</Button>)}</div>
    {error && !actual && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}{mensaje && <p role="status" className="text-sm text-emerald-700">{t(mensaje)}</p>}
    {loading ? <Loader2 className="mx-auto size-6 animate-spin" /> : visibles.length ? <div className="grid gap-4 sm:grid-cols-2">{visibles.map(item => <Card key={`${item.tipo}:${item.item_id}`}><CardHeader><div className="flex flex-wrap gap-2"><Badge variant="secondary">{t(item.tipo === "empresa" ? "Empresa" : "Profesional")}</Badge><Badge variant="outline">{t(ESTADOS[item.estado])}</Badge></div><CardTitle className="text-lg">{item.titulo}</CardTitle><CardDescription>{item.proveedor}</CardDescription></CardHeader><CardContent><p className="mb-4 line-clamp-3 text-sm text-muted-foreground">{item.descripcion}</p><Button variant="outline" onClick={() => { setActual(item); setNota(""); setComprobado(false); setError("") }}><FileSearch className="size-4" />{t("Revisar proyecto")}</Button></CardContent></Card>)}</div> : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("No hay proyectos en este estado.")}</p>}
    <Dialog open={!!actual} onOpenChange={open => { if (!open && !pending) { setActual(null); setError("") } }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">{actual && <>
      <DialogHeader><DialogTitle>{actual.titulo}</DialogTitle><DialogDescription>{actual.proveedor} · {t(actual.tipo === "empresa" ? "Empresa" : "Profesional")}</DialogDescription></DialogHeader>
      <p className="whitespace-pre-line text-sm leading-relaxed">{actual.descripcion}</p>
      {actual.contexto_proveedor && <p className="whitespace-pre-line text-sm text-muted-foreground">{actual.contexto_proveedor}</p>}
      {actual.imagenes?.filter(url => /^https:\/\//i.test(url) || /^\/api\/empresas\/imagen-local\/[0-9a-f-]{36}$/.test(url)).map(url => <img key={url} src={url} alt={actual.titulo} className="max-h-72 w-full rounded-xl object-contain" />)}
      <section className="rounded-xl border bg-muted/30 p-4"><h2 className="text-sm font-semibold">{t("Referencias y evidencias del trabajo")}</h2><p className="mt-2 whitespace-pre-line break-words text-sm">{actual.evidencia_acreditacion || t("No ha aportado evidencias. Solicita información antes de acreditar.")}</p></section>
      {actual.nota && <p className="text-sm">{t("Revisión anterior")}: {actual.nota}</p>}
      <div className="space-y-2"><Label htmlFor="portfolio-nota">{t("Motivo y comprobaciones realizadas")}</Label><Textarea id="portfolio-nota" value={nota} maxLength={2000} minLength={10} disabled={pending} onChange={e => setNota(e.target.value)} /><p className="text-xs text-muted-foreground">{t("El proveedor podrá ver esta nota. No incluyas datos privados de terceros.")}</p></div>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={comprobado} disabled={pending} onChange={e => setComprobado(e.target.checked)} className="mt-1" /><span>{t("He comprobado las evidencias y la participación de este proveedor en el proyecto.")}</span></label>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <div className="flex flex-col gap-3 sm:flex-row"><Button disabled={pending || !comprobado || nota.trim().length < 10 || (actual.evidencia_acreditacion?.trim().length || 0) < 20} onClick={() => revisar("acreditado")}>{pending && <Loader2 className="size-4 animate-spin" />}{t("Acreditar proyecto")}</Button><Button variant="outline" disabled={pending || nota.trim().length < 10} onClick={() => revisar("requiere_informacion")}>{t("Solicitar información")}</Button></div>
    </>}</DialogContent></Dialog>
  </div>
}
