"use client"

import { useState } from "react"
import { Building2, WalletCards, LockKeyhole, ShieldCheck, Landmark, ArrowRight, Info } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { EspacioEmpresa } from "@/lib/empresas/types"

/** Vista local de la cuenta de empresa. No llama a las acciones Stripe de personas. */
export function CobrosEmpresaLocal({ espacio }: { espacio: EspacioEmpresa }) {
  const t = useT()
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const { empresa, miembroActual } = espacio
  const esPrincipal = miembroActual?.rol === "principal"
  const puedeVer = !!miembroActual?.permisos.ver_cobros

  if (!puedeVer) return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><LockKeyhole className="h-5 w-5" />{t("Cobros de la empresa")}</CardTitle><CardDescription>{t("Tu cuenta no tiene permiso para consultar los cobros de esta empresa.")}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">{t("El responsable principal puede concederte acceso de consulta. Atender solicitudes o preparar presupuestos no da acceso al saldo ni a los datos bancarios.")}</p></CardContent></Card>

  return <div className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-5 w-5" />{t("Cobros de la empresa")}</CardTitle><CardDescription className="mt-1.5">{t("Los servicios contratados a la empresa se cobran en su cuenta, independientemente de quién los gestione.")}</CardDescription></div>
          <Badge variant="outline">{t("Sin conectar")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border p-4"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{t("Titular de los cobros")}</p><p className="mt-1 break-words text-sm font-medium">{empresa.razonSocial}</p><p className="mt-1 text-xs text-muted-foreground">{t("Una cuenta de cobros para todo el equipo")}</p></div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[{titulo:"Pagos protegidos",detalle:"Pendientes de liberar tras la entrega"},{titulo:"Saldo disponible",detalle:"Liberado y disponible en Stripe"},{titulo:"Próximo ingreso",detalle:"Transferencia al banco de la empresa"}].map((dato) => <div key={dato.titulo} className="rounded-xl border bg-muted/30 p-4"><p className="text-xs font-medium text-muted-foreground">{t(dato.titulo)}</p><p className="mt-1 text-2xl font-semibold tracking-tight" aria-label={t("Sin datos")}>—</p><p className="mt-1 text-xs text-muted-foreground">{t(dato.detalle)}</p></div>)}
        </div>
        <p className="text-sm text-muted-foreground">{t("Esta empresa de prueba no tiene una cuenta Stripe conectada. Los saldos y movimientos aparecerán cuando se integre la cuenta de cobros de la empresa.")}</p>
        {esPrincipal ? <Button variant="outline" className="h-auto min-h-9 w-full whitespace-normal text-left sm:w-auto" onClick={() => setMostrarAlta(true)}><Landmark className="mr-2 h-4 w-4 shrink-0" />{t("Cómo activar los cobros")}</Button> : <p className="flex items-start gap-2 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />{t("La activación y los cambios de titularidad o cuenta bancaria corresponden al responsable principal.")}</p>}
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle className="text-lg">{t("Del pago al ingreso")}</CardTitle></CardHeader><CardContent>
      <ol className="grid gap-5 sm:grid-cols-3">
        {[{titulo:"El cliente paga",texto:"El presupuesto identifica a la empresa que presta el servicio y a la persona que lo gestiona."},{titulo:"Se confirma la entrega",texto:"Se mantiene la protección del pago y el proceso de cancelaciones e incidencias de Diime."},{titulo:"Cobra la empresa",texto:"El importe que corresponda, descontadas las comisiones, se transfiere a la cuenta de la empresa."}].map((paso,i) => <li key={paso.titulo} className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium"><span className="text-muted-foreground">{i+1}.</span>{t(paso.titulo)}{i<2 && <ArrowRight className="ml-auto hidden h-4 w-4 text-muted-foreground sm:block" />}</p><p className="text-sm leading-relaxed text-muted-foreground">{t(paso.texto)}</p></li>)}
      </ol>
      <div className="mt-5 space-y-2 border-t pt-4 text-sm text-muted-foreground"><p>{t("El empleado puede gestionar el trabajo con sus permisos. Su cuenta bancaria personal no recibe el pago de la empresa.")}</p><p>{t("La salida de un miembro no cambia el destinatario de los cobros ni el historial. La empresa gestiona por su cuenta la remuneración de su equipo.")}</p></div>
    </CardContent></Card>

    <Dialog open={mostrarAlta} onOpenChange={setMostrarAlta}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("Activar cobros a nombre de la empresa")}</DialogTitle><DialogDescription>{t("Este es el recorrido previsto. La versión local no abre Stripe ni crea una cuenta de cobros.")}</DialogDescription></DialogHeader>
      <div className="space-y-5 text-sm"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><p className="font-medium">{t("1. Representación acreditada en Diime")}</p><p className="mt-1 text-muted-foreground">{t("El responsable principal acredita la autorización para gestionar la empresa.")}</p></div></div><div className="flex gap-3"><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><p className="font-medium">{t("2. Alta de la empresa en Stripe")}</p><p className="mt-1 text-muted-foreground">{t("Se completa la información de la sociedad, sus representantes y los demás datos que Stripe solicite.")}</p></div></div><div className="flex gap-3"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><p className="font-medium">{t("3. Cuenta bancaria de la empresa")}</p><p className="mt-1 text-muted-foreground">{t("El responsable configura el destino bancario mediante el formulario seguro de Stripe. Solo se habilitan pagos cuando la cuenta reúne los requisitos.")}</p></div></div><p className="flex gap-2 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" />{t("La verificación de Stripe para cobrar y la autorización para administrar una empresa en Diime son comprobaciones distintas.")}</p></div>
      <Button onClick={() => setMostrarAlta(false)}>{t("Entendido")}</Button>
    </DialogContent></Dialog>
  </div>
}
