"use client"

import { useT } from "@/components/idioma-provider"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { AlertCircle, AlertTriangle, Ban, FileText, Loader2, Trash2 } from "lucide-react"
import {
  consecuenciasDeEliminarMiCuenta,
  eliminarMiCuenta,
  type ConsecuenciasBaja,
} from "@/app/actions/auth"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

// Confirmación del cierre irreversible, una vez resueltos los contratos y pagos.
// The confirmation word follows the selected interface language.

// Cada consecuencia real de esta cuenta concreta, con sus números. Un aviso
// genérico ("perderás el acceso") no basta cuando lo que se puede llevar por
// delante es un trabajo que otra persona ya ha pagado.
function avisos(c: ConsecuenciasBaja, t: ReturnType<typeof useT>) {
  const lista: { texto: string; grave?: boolean }[] = []

  if (c.demandas_a_borrar > 0) {
    const n = c.demandas_a_borrar
    lista.push({
      texto:
        n === 1
          ? t("Se borrará tu demanda publicada, junto con las ofertas que hayas recibido en ella.")
          : t("Se borrarán tus {n} demandas publicadas, junto con las ofertas que hayas recibido en ellas.", { n }),
    })
  }

  if (c.ofertas_a_retirar > 0) {
    const n = c.ofertas_a_retirar
    lista.push({
      texto:
        n === 1
          ? t("Se retirará tu puja pendiente: nadie podrá aceptártela.")
          : t("Se retirarán tus {n} pujas pendientes: nadie podrá aceptártelas.", { n }),
    })
  }

  if (c.es_profesional) {
    lista.push({ texto: t("Desaparecerás de la sección de Profesionales y dejarás de recibir avisos de demandas.") })
  }

  lista.push({ texto: t("Perderás el acceso: no podrás volver a entrar con esta cuenta ni recuperarla.") })

  return lista
}

export function EliminarCuentaDialog() {
  const t = useT()
  const CONFIRMACION = t("ELIMINAR")
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [texto, setTexto] = useState("")
  const [entendido, setEntendido] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecuencias, setConsecuencias] = useState<ConsecuenciasBaja | null>(null)
  const [cargando, setCargando] = useState(false)

  // Se consultan al abrir, no al montar: no tiene sentido pedirlas a todo el que
  // entra en Configuración.
  useEffect(() => {
    if (!open) return
    setCargando(true)
    setError(null)
    consecuenciasDeEliminarMiCuenta().then((r) => {
      if (r.error) setError(r.error)
      else setConsecuencias(r.data ?? null)
    }).catch(() => setError("No se pudo comprobar tu cuenta. Cierra esta ventana y vuelve a intentarlo."))
      .finally(() => setCargando(false))
  }, [open])

  const trabajosPendientes = (consecuencias?.trabajos_proveedor ?? 0) +
    (consecuencias?.trabajos_cliente_con_dinero ?? 0) + (consecuencias?.trabajos_cliente_sin_pagar ?? 0)
  const bloqueado = trabajosPendientes > 0 || (consecuencias?.trabajos_pendientes ?? 0) > 0 ||
    (consecuencias?.pagos_pendientes ?? 0) > 0 || (consecuencias?.disputas_abiertas ?? 0) > 0

  const confirmar = async () => {
    setEnviando(true)
    setError(null)

    const res = await eliminarMiCuenta()

    if (res?.error) {
      setError(res.error)
      setEnviando(false)
      return
    }

    toast({
      title: t("Cuenta eliminada"),
      description: t("Hemos cerrado tu cuenta y tu sesión."),
    })
    setOpen(false)
    // Recarga completa: la sesión ya no existe y hay que soltar todo lo que
    // quedara cacheado del usuario.
    window.location.href = "/"
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) {
          setTexto("")
          setEntendido(false)
          setError(null)
          setConsecuencias(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-transparent text-destructive border-destructive/40 hover:bg-destructive/10 gap-2"
        >
          <Trash2 className="h-4 w-4" />
          {t("Eliminar mi cuenta")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive text-xl">
            <AlertTriangle className="h-6 w-6" />
            {t("Vas a eliminar tu cuenta")}
          </DialogTitle>
          <DialogDescription>
            {t("Léelo entero antes de confirmar. Esto no se puede deshacer y afecta a otras personas.")}
          </DialogDescription>
        </DialogHeader>

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Comprobando qué tienes pendiente...")}
          </div>
        )}

        {!cargando && error && !consecuencias && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}

        {!cargando && consecuencias && (
          <div className="space-y-4 text-sm">
            {bloqueado ? (
              <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3">
                <Ban className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">{t("Ahora mismo no puedes darte de baja")}</p>
                  <p className="text-muted-foreground mt-1">
                    {t("Primero finaliza o cancela de mutuo acuerdo tus contratos, resuelve las disputas y completa los cobros o reembolsos pendientes. Conservas el acceso para hacerlo desde")} {" "}
                    <Link href="/mis-trabajos" className="underline">{t("Mis trabajos")}</Link>, {" "}
                    <Link href="/mis-solicitudes" className="underline">{t("Mis solicitudes")}</Link> {t("y")} {" "}
                    <Link href="/cobros" className="underline">{t("Cobros")}</Link>{t(". Si un pago está bloqueado, contacta con soporte.")}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-destructive/40 p-4">
                  <p className="font-semibold text-destructive mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t("Qué va a pasar")}
                  </p>
                  <ul className="space-y-2">
                    {avisos(consecuencias, t).map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={a.grave ? "text-destructive font-bold" : "text-muted-foreground"}>•</span>
                        <span className={a.grave ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {a.texto}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Que los datos NO desaparezcan del todo es lo más fácil de
                    malinterpretar, así que se dice explícitamente y con el
                    motivo, no en la letra pequeña. */}
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="font-semibold mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {t("Qué se conserva, y por qué")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("Tu nombre y tus datos de facturación seguirán apareciendo en los trabajos y facturas ya cerrados, y las personas con las que trabajaste podrán seguir viéndolos. Es obligatorio conservar los registros contables, y es lo que permite reclamar a cualquiera de las dos partes si algo acaba en los tribunales. Lo que desaparece de la web es tu perfil: foto, descripción, ficha profesional y publicaciones.")}
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t(error)}</span>
              </div>
            )}

            {!bloqueado && (
              <div className="space-y-3 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={entendido}
                    onCheckedChange={(v) => setEntendido(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">
                    {t("He leído lo de arriba, entiendo que no tiene vuelta atrás y que no podré recuperar la cuenta.")}
                  </span>
                </label>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-borrado">
                    {t("Escribe")} <span className="font-mono font-semibold text-destructive">{CONFIRMACION}</span> {t("para confirmar")}
                  </Label>
                  <Input
                    id="confirmar-borrado"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder={CONFIRMACION}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={enviando}>
            {bloqueado ? t("Entendido") : t("Cancelar")}
          </Button>
          {!bloqueado && (
            <Button
              variant="destructive"
              onClick={confirmar}
              disabled={enviando || cargando || !consecuencias || !entendido || texto.trim() !== CONFIRMACION}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("Eliminando...")}
                </>
              ) : (
                t("Eliminar mi cuenta")
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
