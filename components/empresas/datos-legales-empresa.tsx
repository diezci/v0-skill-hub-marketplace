"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, CheckCircle2, FileCheck2, Loader2, MapPin, Pencil, Search, ShieldCheck } from "lucide-react"
import { buscarDireccionEmpresa, guardarDatosLegalesEmpresa } from "@/app/actions/empresa-datos-legales"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EspacioEmpresa } from "@/lib/empresas/types"
import type { DireccionFirmada } from "@/lib/empresas/domicilio"
import { useT } from "@/components/idioma-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { DatosLegalesEmpresa } from "@/lib/perfil-profesional-editor"

export function DatosLegalesEmpresaCard({ datos, editando = false, onDomicilioChange }: {
  datos: DatosLegalesEmpresa
  editando?: boolean
  onDomicilioChange?: (domicilio: string) => void
}) {
  const t = useT()
  return <Card>
    <CardHeader><CardTitle className="text-lg">{t("Datos de la empresa")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-sm font-medium">{t("Razón social")}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{datos.razonSocial || t("No especificado")}</dd></div>
        <div className="min-w-0"><dt className="text-sm font-medium">{t("CIF")}</dt><dd className="mt-1 break-words text-sm text-muted-foreground">{datos.cif || t("No especificado")}</dd></div>
      </dl>
      <div className="space-y-1">
        {editando && onDomicilioChange ? <>
          <Label htmlFor="empresa-domicilio">{t("Domicilio")}</Label>
          <Textarea id="empresa-domicilio" rows={2} maxLength={500} value={datos.domicilio}
            placeholder={t("Calle, número, código postal y localidad")}
            onChange={(event) => onDomicilioChange(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("Este domicilio se mostrará en el perfil público de tu empresa.")}</p>
        </> : <dl><dt className="text-sm font-medium">{t("Domicilio")}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{datos.domicilio || t("No especificado")}</dd></dl>}
      </div>
    </CardContent>
  </Card>
}


export function DatosLegalesEmpresaEditor({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const router = useRouter()
  const { empresa, miembroActual } = espacio
  const principal = miembroActual?.rol === "principal"
  const puedeEditar = principal || !!miembroActual?.permisos.perfil
  const actuales = { razonSocial: empresa.razonSocial, cif: empresa.nif, domicilio: empresa.domicilio || "" }
  const [datos, setDatos] = useState(actuales)
  const [baseEdicion, setBaseEdicion] = useState(actuales)
  const [editando, setEditando] = useState(false)
  const [consulta, setConsulta] = useState(actuales.domicilio)
  const [resultados, setResultados] = useState<DireccionFirmada[] | null>(null)
  const [seleccion, setSeleccion] = useState<DireccionFirmada | null>(null)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [buscando, iniciarBusqueda] = useTransition()
  const [guardando, iniciarGuardado] = useTransition()
  const ocupado = buscando || guardando
  const identidadCambiada = datos.razonSocial.trim() !== baseEdicion.razonSocial || datos.cif.replace(/[\s-]/g, "").toUpperCase() !== baseEdicion.cif
  const direccionCambiada = datos.domicilio !== baseEdicion.domicilio

  useEffect(() => {
    if (!editando) { setDatos({ razonSocial: empresa.razonSocial, cif: empresa.nif, domicilio: empresa.domicilio || "" }); setConsulta(empresa.domicilio || "") }
  }, [empresa.razonSocial, empresa.nif, empresa.domicilio, editando])

  function editar() { setBaseEdicion(actuales); setError(""); setMensaje(""); setSeleccion(null); setResultados(null); setEditando(true) }
  function buscar() {
    setError(""); setResultados(null)
    iniciarBusqueda(async () => {
      try {
        const result = await buscarDireccionEmpresa(consulta)
        if (result.error) { setError(result.error); return }
        setResultados(result.data || [])
      } catch { setError("El servicio de direcciones no está disponible. Vuelve a intentarlo.") }
    })
  }
  function guardar(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMensaje("")
    iniciarGuardado(async () => {
      try {
        const result = await guardarDatosLegalesEmpresa({ ...datos, anteriores: baseEdicion, comprobante: seleccion?.comprobante })
        if (result.error) { setError(result.error); return }
        setMensaje(result.data?.identidadModificada ? "Datos guardados. Presenta documentación actualizada en Verificación para volver a acreditar la empresa." : "Datos de la empresa guardados.")
        setEditando(false); setSeleccion(null); setResultados(null); router.refresh()
      } catch { setError("No se pudieron guardar los datos. Vuelve a intentarlo.") }
    })
  }

  return <div className="mx-auto max-w-4xl space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">{t("Identidad y domicilio")}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{t("Datos legales de tu empresa")}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("Mantén al día la razón social, el CIF y la dirección que aparecen en tu perfil público.")}</p></div>
    <Card className="overflow-hidden rounded-2xl border-border/70 py-0 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/20 p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" aria-hidden="true" /></span><div><CardTitle className="text-base">{t("Identidad de la empresa")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{t("Datos visibles en el perfil público")}</p></div></div>
        {puedeEditar && !editando && <Button variant="outline" size="sm" onClick={editar}><Pencil className="size-3.5" aria-hidden="true" />{t("Editar datos")}</Button>}
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={guardar} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-[1.6fr_1fr]">
            <div className="space-y-2"><Label htmlFor="legal-razon-social">{t("Razón social")}</Label>{editando && principal ? <Input id="legal-razon-social" value={datos.razonSocial} onChange={(e) => setDatos({ ...datos, razonSocial: e.target.value })} minLength={2} maxLength={160} required disabled={ocupado} autoComplete="organization" /> : <p className="break-words text-sm text-muted-foreground">{datos.razonSocial || t("No especificado")}</p>}</div>
            <div className="space-y-2"><Label htmlFor="legal-cif">{t("CIF / NIF de la empresa")}</Label>{editando && principal ? <Input id="legal-cif" value={datos.cif} onChange={(e) => setDatos({ ...datos, cif: e.target.value.toUpperCase() })} maxLength={15} required disabled={ocupado} autoCapitalize="characters" spellCheck={false} /> : <p className="text-sm text-muted-foreground">{datos.cif || t("No especificado")}</p>}</div>
          </div>
          {editando && !principal && <p className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{t("Puedes modificar el domicilio. La razón social y el CIF los edita el responsable principal de la cuenta.")}</p>}
          {editando && identidadCambiada && <div role="status" className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" /><p className="leading-relaxed">{t("Al cambiar la razón social o el CIF, la empresa necesitará una nueva verificación. El perfil público quedará oculto hasta que Diime revise la documentación actualizada. Los contratos y las facturas anteriores conservan sus datos.")}</p></div>}
          <section className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-medium"><MapPin className="size-4 text-primary" aria-hidden="true" />{t("Domicilio de la empresa")}</h3>{(seleccion || empresa.domicilioComprobadoEn && !direccionCambiada) && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" aria-hidden="true" />{t("Dirección localizada")}</span>}</div>
            {!editando ? <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{datos.domicilio || t("No especificado")}</p> : <>
              <Label htmlFor="legal-direccion-busqueda" className="text-xs text-muted-foreground">{t("Busca la calle, el número y la localidad")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row"><Input id="legal-direccion-busqueda" value={consulta} onChange={(e) => { setConsulta(e.target.value); setResultados(null) }} placeholder={t("Calle, número, código postal y localidad")} maxLength={300} disabled={ocupado} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!ocupado && consulta.trim().length >= 8) buscar() } }} /><Button type="button" variant="outline" onClick={buscar} disabled={ocupado || consulta.trim().length < 8}>{buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{t("Comprobar dirección")}</Button></div>
              {resultados && (resultados.length ? <div className="overflow-hidden rounded-xl border" aria-label={t("Direcciones encontradas")}><p className="border-b bg-muted/30 px-4 py-2.5 text-xs font-medium">{t("Selecciona la dirección exacta")}</p>{resultados.map((d) => <button key={d.id} type="button" className="flex w-full items-start gap-3 border-b p-4 text-left text-sm transition-colors last:border-0 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" disabled={ocupado} onClick={() => { setSeleccion(d); setDatos({ ...datos, domicilio: d.domicilio }); setResultados(null); setError("") }}><MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><span>{d.domicilio}</span></button>)}</div> : <p role="status" className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">{t("No encontramos un portal con esa dirección. Revisa el número, el código postal y la localidad. No hemos comprobado el domicilio.")}</p>)}
              {datos.domicilio && <div className="flex items-start justify-between gap-3 rounded-xl border bg-muted/20 p-4"><div><p className="text-xs font-medium text-muted-foreground">{t(seleccion ? "Dirección seleccionada" : "Domicilio guardado")}</p><p className="mt-1 text-sm leading-relaxed">{datos.domicilio}</p></div><Button type="button" variant="ghost" size="sm" disabled={ocupado} onClick={() => { setDatos({ ...datos, domicilio: "" }); setSeleccion(null); setConsulta(""); setResultados(null) }}>{t("Quitar")}</Button></div>}
              <p className="text-xs leading-relaxed text-muted-foreground">{t("La búsqueda consulta CartoCiudad (IGN) y comprueba que el portal está localizado. No acredita que la empresa esté domiciliada allí.")} <a href="https://www.cartociudad.es/web/portal/directorio-de-servicios/geoprocesamiento" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t("Fuente de las direcciones")}</a></p>
            </>}
          </section>
          {editando && <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={ocupado} onClick={() => { setEditando(false); setError(""); setSeleccion(null); setResultados(null) }}>{t("Cancelar")}</Button><Button type="submit" disabled={ocupado || (!identidadCambiada && !direccionCambiada && !seleccion)}>{guardando ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}{t("Guardar datos legales")}</Button></div>}
          {error && <p role="alert" className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive">{t(error)}</p>}{mensaje && <p role="status" className="rounded-xl bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{t(mensaje)}</p>}
        </form>
      </CardContent>
    </Card>
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t("Solo el responsable principal puede cambiar la identidad legal. El equipo con permiso de edición puede actualizar el domicilio.")}</p>
  </div>
}
