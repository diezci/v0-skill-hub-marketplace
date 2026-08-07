"use client"

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
import { AlertCircle, AlertTriangle, Ban, FileText, Loader2, ShieldAlert, Trash2 } from "lucide-react"
import {
  consecuenciasDeEliminarMiCuenta,
  eliminarMiCuenta,
  type ConsecuenciasBaja,
} from "@/app/actions/auth"
import { useToast } from "@/hooks/use-toast"

// La palabra que hay que teclear para confirmar. Es irreversible y puede mover
// dinero de terceros: un clic de más no debería bastar para provocarlo.
const CONFIRMACION = "ELIMINAR"

function euros(n: number) {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
}

// Cada consecuencia real de esta cuenta concreta, con sus números. Un aviso
// genérico ("perderás el acceso") no basta cuando lo que se puede llevar por
// delante es un trabajo que otra persona ya ha pagado.
function avisos(c: ConsecuenciasBaja) {
  const lista: { texto: string; grave?: boolean }[] = []

  if (c.demandas_a_borrar > 0) {
    const n = c.demandas_a_borrar
    lista.push({
      texto:
        n === 1
          ? "Se borrará tu demanda publicada, junto con las ofertas que hayas recibido en ella."
          : `Se borrarán tus ${n} demandas publicadas, junto con las ofertas que hayas recibido en ellas.`,
    })
  }

  if (c.ofertas_a_retirar > 0) {
    const n = c.ofertas_a_retirar
    lista.push({
      texto:
        n === 1
          ? "Se retirará tu puja pendiente: nadie podrá aceptártela."
          : `Se retirarán tus ${n} pujas pendientes: nadie podrá aceptártelas.`,
    })
  }

  if (c.trabajos_proveedor > 0) {
    const n = c.trabajos_proveedor
    const uno = n === 1
    lista.push({
      grave: true,
      texto:
        (uno
          ? "Tienes un trabajo contratado como profesional. Se cancelará y "
          : `Tienes ${n} trabajos contratados como profesional. Se cancelarán y `) +
        (c.importe_a_devolver > 0
          ? `se ${uno ? "le devolverán" : "les devolverán"} ${euros(c.importe_a_devolver)} a ${
              uno ? "tu cliente" : "tus clientes"
            }. No cobrarás nada por ${uno ? "él" : "ellos"}.`
          : `${uno ? "tu cliente se quedará" : "tus clientes se quedarán"} sin el servicio. No cobrarás nada por ${
              uno ? "él" : "ellos"
            }.`),
    })
  }

  if (c.trabajos_cliente_con_dinero > 0) {
    const n = c.trabajos_cliente_con_dinero
    const uno = n === 1
    lista.push({
      grave: true,
      texto:
        (uno ? "Tienes un trabajo pagado y sin confirmar" : `Tienes ${n} trabajos pagados y sin confirmar`) +
        (c.importe_en_custodia > 0 ? `, con ${euros(c.importe_en_custodia)} retenidos en custodia` : "") +
        `. Al no estar tú para confirmar la entrega, avisaremos ${
          uno ? "al profesional" : "a los profesionales"
        } y será Diime quien decida qué hacer con ese dinero. Si el trabajo está bien hecho, lo normal será pagárselo ${
          uno ? "a él" : "a ellos"
        }.`,
    })
  }

  if (c.trabajos_cliente_sin_pagar > 0) {
    const n = c.trabajos_cliente_sin_pagar
    lista.push({
      texto:
        n === 1
          ? "Se cancelará un trabajo que aún no habías pagado."
          : `Se cancelarán ${n} trabajos que aún no habías pagado.`,
    })
  }

  if (c.es_profesional) {
    lista.push({ texto: "Desaparecerás de la sección de Profesionales y dejarás de recibir avisos de demandas." })
  }

  lista.push({ texto: "Perderás el acceso: no podrás volver a entrar con esta cuenta ni recuperarla." })

  return lista
}

export function EliminarCuentaDialog() {
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
    consecuenciasDeEliminarMiCuenta().then((r) => {
      if (r.error) setError(r.error)
      else setConsecuencias(r.data ?? null)
      setCargando(false)
    })
  }, [open])

  // Una disputa abierta no se puede dejar a medias: la otra parte se quedaría
  // sin nadie con quien cerrarla, así que ni se ofrece el botón.
  const bloqueado = (consecuencias?.disputas_abiertas ?? 0) > 0
  const hayDinero =
    (consecuencias?.trabajos_proveedor ?? 0) > 0 || (consecuencias?.trabajos_cliente_con_dinero ?? 0) > 0

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
      title: "Cuenta eliminada",
      description: "Hemos cerrado tu cuenta y tu sesión.",
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
          Eliminar mi cuenta
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive text-xl">
            <AlertTriangle className="h-6 w-6" />
            Vas a eliminar tu cuenta
          </DialogTitle>
          <DialogDescription>
            Léelo entero antes de confirmar. Esto no se puede deshacer y afecta a otras personas.
          </DialogDescription>
        </DialogHeader>

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Comprobando qué tienes pendiente...
          </div>
        )}

        {!cargando && consecuencias && (
          <div className="space-y-4 text-sm">
            {bloqueado ? (
              <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3">
                <Ban className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">Ahora mismo no puedes darte de baja</p>
                  <p className="text-muted-foreground mt-1">
                    Tienes {consecuencias.disputas_abiertas} disputa
                    {consecuencias.disputas_abiertas !== 1 ? "s" : ""} abierta
                    {consecuencias.disputas_abiertas !== 1 ? "s" : ""}. Hay que resolverla
                    {consecuencias.disputas_abiertas !== 1 ? "s" : ""} antes: si desapareces, la otra parte se queda
                    sin nadie con quien cerrarla.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* El aviso fuerte va arriba y solo aparece cuando de verdad hay
                    dinero de por medio, para que no se convierta en ruido. */}
                {hayDinero && (
                  <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-destructive">Hay dinero de por medio</p>
                      <p className="text-muted-foreground mt-1">
                        Tienes trabajos en marcha con pagos abiertos. Si te das de baja ahora, decides por ti y por la
                        otra parte. Asegúrate de cerrarlos antes si te interesa cobrarlos o recibirlos.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-destructive/40 p-4">
                  <p className="font-semibold text-destructive mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Qué va a pasar
                  </p>
                  <ul className="space-y-2">
                    {avisos(consecuencias).map((a, i) => (
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
                    Qué se conserva, y por qué
                  </p>
                  <p className="text-muted-foreground">
                    Tu nombre y tus datos de facturación seguirán apareciendo en los trabajos y facturas ya cerrados, y
                    las personas con las que trabajaste podrán seguir viéndolos. Es obligatorio conservar los registros
                    contables, y es lo que permite reclamar a cualquiera de las dos partes si algo acaba en los
                    tribunales. Lo que desaparece de la web es tu perfil: foto, descripción, ficha profesional y
                    publicaciones.
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
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
                    He leído lo de arriba, entiendo que no tiene vuelta atrás y que no podré recuperar la cuenta.
                  </span>
                </label>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-borrado">
                    Escribe <span className="font-mono font-semibold text-destructive">{CONFIRMACION}</span> para
                    confirmar
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
            {bloqueado ? "Entendido" : "Cancelar"}
          </Button>
          {!bloqueado && (
            <Button
              variant="destructive"
              onClick={confirmar}
              disabled={enviando || cargando || !entendido || texto.trim() !== CONFIRMACION}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar mi cuenta"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
