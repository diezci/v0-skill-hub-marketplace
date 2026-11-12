"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ArrowDown, ArrowUp, LockKeyhole, Plus, Trash2 } from "lucide-react"
import { useIdioma } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { MIN_HITO_CENTIMOS, type HitoBorrador, type ModalidadPago } from "@/lib/hitos"

export function nuevoHito(): HitoBorrador {
  return { id: crypto.randomUUID(), titulo: "", descripcion: "", criterio_aceptacion: "", fecha_limite: "", importe_centimos: 0 }
}

export function ModalidadPagoSelector({ value, onChange, disabled = false, sugerencia = false }: {
  value: ModalidadPago
  onChange: (value: ModalidadPago) => void
  disabled?: boolean
  sugerencia?: boolean
}) {
  const { t } = useIdioma()
  const id = useId()
  return <fieldset className="min-w-0 space-y-3" disabled={disabled}>
    <legend className="text-sm font-medium">{t(sugerencia ? "¿Cómo prefieres organizar el pago?" : "Plan de pagos")}</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {([{ value: "unico", titulo: "Pago único", texto: "Un pago antes de comenzar. Se libera al aprobar el trabajo." }, { value: "hitos", titulo: "Por hitos", texto: "Cada fase se paga antes de comenzar y se libera al aprobar su entrega." }] as const).map(opcion => <label key={opcion.value} htmlFor={`${id}-${opcion.value}`} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", value === opcion.value && "border-primary bg-primary/5", disabled && "cursor-default opacity-60")}>
        <input id={`${id}-${opcion.value}`} type="radio" name={id} value={opcion.value} checked={value === opcion.value} onChange={() => onChange(opcion.value)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-600" />
        <span className="min-w-0"><span className="block font-medium">{t(opcion.titulo)}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(opcion.texto)}</span></span>
      </label>)}
    </div>
    {sugerencia && <p className="text-xs text-muted-foreground">{t("Es una preferencia. Acordarás el plan definitivo al aceptar un presupuesto. Publicar no realiza ningún cobro.")}</p>}
  </fieldset>
}

function ImporteHito({ id, value, onChange, disabled, requerido }: { id: string; value: number; onChange: (value: number) => void; disabled: boolean; requerido: boolean }) {
  const { t } = useIdioma()
  const input = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState(value > 0 ? (value / 100).toFixed(2) : "")
  const [valorEmitido, setValorEmitido] = useState(value)
  useEffect(() => {
    if (value !== valorEmitido) { setTexto(value > 0 ? (value / 100).toFixed(2) : ""); setValorEmitido(value) }
  }, [value, valorEmitido])
  const menorQueMinimo = requerido && value < MIN_HITO_CENTIMOS
  useEffect(() => {
    input.current?.setCustomValidity(menorQueMinimo ? t("Cada hito debe tener un importe mínimo de 0,50 €.") : "")
  }, [menorQueMinimo, t])
  return <div className="space-y-1"><Input ref={input} id={id} inputMode="decimal" value={texto} disabled={disabled} placeholder="0,00" required={requerido} aria-invalid={!!texto && menorQueMinimo || undefined} aria-describedby={requerido ? `${id}-minimo` : undefined} pattern="[0-9]+([.,][0-9]{1,2})?" onChange={event => {
    const raw = event.target.value
    setTexto(raw)
    const importe = !raw ? 0 : /^\d+([.,]\d{0,2})?$/.test(raw) ? Math.round(Number(raw.replace(",", ".")) * 100) : -1
    setValorEmitido(importe)
    onChange(importe)
  }} />{requerido && <p id={`${id}-minimo`} className="text-xs text-muted-foreground">{t("Mínimo 0,50 € por hito.")}</p>}</div>
}

export function PlanHitosEditor({ value, onChange, totalCentimos, sugerencia = false, disabled = false, bloqueados = [], error }: {
  value: HitoBorrador[]
  onChange: (hitos: HitoBorrador[]) => void
  totalCentimos?: number
  sugerencia?: boolean
  disabled?: boolean
  bloqueados?: string[]
  error?: string | null
}) {
  const { t, idioma } = useIdioma()
  const id = useId()
  const moneda = (centimos: number) => new Intl.NumberFormat(idioma === "en" ? "en-IE" : "es-ES", { style: "currency", currency: "EUR" }).format(centimos / 100)
  const suma = value.reduce((total, hito) => total + Math.max(0, hito.importe_centimos), 0)
  const cambiar = (indice: number, campos: Partial<HitoBorrador>) => onChange(value.map((hito, i) => i === indice ? { ...hito, ...campos } : hito))
  const mover = (indice: number, delta: number) => {
    const siguiente = [...value]
    ;[siguiente[indice], siguiente[indice + delta]] = [siguiente[indice + delta], siguiente[indice]]
    onChange(siguiente)
  }
  return <div className="min-w-0 space-y-4">
    <div><p className="text-sm font-medium">{t(sugerencia ? "Hitos que propones (opcional)" : "Hitos del mismo trabajo")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(sugerencia ? "Añade o quita fases para explicar lo que necesitas. Puedes dejar los importes y fechas por acordar." : "Puedes añadir o quitar hitos y repartir el precio acordado. Cada hito necesita un importe, una fecha y un criterio de aceptación.")}</p></div>
    <ol className="space-y-0">
      {value.map((hito, indice) => {
        const bloqueado = bloqueados.includes(hito.id)
        const campoId = `${id}-${hito.id}`
        return <li key={hito.id} className="relative min-w-0 pb-5 pl-8 last:pb-0">
          {indice < value.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3 top-6 w-px bg-border" />}
          <span aria-hidden="true" className={cn("absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs font-medium", bloqueado ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-primary/40 text-primary")}>{bloqueado ? <LockKeyhole className="h-3 w-3" /> : indice + 1}</span>
          <div className="min-w-0 space-y-3 rounded-xl border bg-card p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{t("Hito {numero}", { numero: indice + 1 })}</p><div className="flex shrink-0 gap-1">
              {!sugerencia && <><Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled || bloqueado || indice === 0 || bloqueados.includes(value[indice - 1]?.id)} onClick={() => mover(indice, -1)} aria-label={t("Subir hito {numero}", { numero: indice + 1 })}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-9 w-9" disabled={disabled || bloqueado || indice === value.length - 1 || bloqueados.includes(value[indice + 1]?.id)} onClick={() => mover(indice, 1)} aria-label={t("Bajar hito {numero}", { numero: indice + 1 })}><ArrowDown className="h-4 w-4" /></Button></>}
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" disabled={disabled || bloqueado} onClick={() => onChange(value.filter((_, i) => i !== indice))} aria-label={t("Quitar hito {numero}", { numero: indice + 1 })}><Trash2 className="h-4 w-4" /></Button>
            </div></div>
            <div className="space-y-1.5"><Label htmlFor={`${campoId}-titulo`}>{t("Título del hito")}</Label><Input id={`${campoId}-titulo`} value={hito.titulo} maxLength={160} disabled={disabled || bloqueado} required onChange={event => cambiar(indice, { titulo: event.target.value })} placeholder={t("Ej.: Preparación y materiales")} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="min-w-0 space-y-1.5"><Label htmlFor={`${campoId}-importe`}>{t("Importe (€)")}</Label><ImporteHito id={`${campoId}-importe`} value={hito.importe_centimos} disabled={disabled || bloqueado} requerido={!sugerencia} onChange={importe_centimos => cambiar(indice, { importe_centimos })} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor={`${campoId}-fecha`}>{t("Fecha de entrega")}</Label><Input className="min-w-0 max-w-full" id={`${campoId}-fecha`} type="date" value={hito.fecha_limite} disabled={disabled || bloqueado} required={!sugerencia} onChange={event => cambiar(indice, { fecha_limite: event.target.value })} /></div></div>
            <div className="space-y-1.5"><Label htmlFor={`${campoId}-criterio`}>{t("¿Qué debe cumplirse para aprobarlo?")}</Label><Textarea id={`${campoId}-criterio`} rows={2} maxLength={2000} value={hito.criterio_aceptacion} disabled={disabled || bloqueado} required={!sugerencia} onChange={event => cambiar(indice, { criterio_aceptacion: event.target.value })} placeholder={t("Describe el resultado y las evidencias que se entregarán")} /></div>
            {bloqueado && <p className="text-xs text-muted-foreground">{t("Este hito ya tiene un pago asociado. Sus condiciones se conservan en el historial.")}</p>}
          </div>
        </li>
      })}
    </ol>
    <Button type="button" variant="outline" className="min-h-11 w-full border-dashed" disabled={disabled || value.length >= 20} onClick={() => onChange([...value, nuevoHito()])}><Plus className="mr-2 h-4 w-4" />{t("Añadir hito")}</Button>
    {!sugerencia && <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite"><div className="flex flex-wrap justify-between gap-2"><span>{t("Suma de los hitos")}</span><strong>{moneda(suma)}</strong></div>{totalCentimos !== undefined && <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{t("Precio acordado del servicio")}</span><span>{moneda(totalCentimos)}</span></div>}<p className="text-xs text-muted-foreground">{t("Los gastos de servicio se calculan para el contrato completo y se reparten entre los hitos.")}</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
  </div>
}
