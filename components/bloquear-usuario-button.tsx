"use client"

import { useT } from "@/components/idioma-provider"

import { useEffect, useState } from "react"
import { Ban, Loader2, UserCheck } from "lucide-react"
import { bloquearUsuario, desbloquearUsuario, obtenerEstadoBloqueo } from "@/app/actions/bloqueos"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

export function BloquearUsuarioButton({
  usuarioId,
  className,
  onEstado,
}: {
  usuarioId: string
  className?: string
  onEstado?: (interaccionBloqueada: boolean) => void
}) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    let activo = true
    obtenerEstadoBloqueo(usuarioId).then((estado) => {
      if (!activo) return
      setVisible(
        !!estado.autenticado &&
          !estado.esMismoUsuario &&
          !estado.esEquipoDiime &&
          !estado.pendienteMigracion,
      )
      setBloqueado(!!estado.bloqueadoPorMi)
      onEstado?.(!!estado.meHaBloqueado || (!estado.esEquipoDiime && !!estado.bloqueadoPorMi))
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [onEstado, usuarioId])

  const desbloquear = async () => {
    setCargando(true)
    const result = await desbloquearUsuario(usuarioId)
    if (result.error) {
      toast({ title: t("No se pudo desbloquear"), description: result.error ? t(result.error) : undefined, variant: "destructive" })
    } else {
      setBloqueado(false)
      onEstado?.(false)
      toast({ title: t("Usuario desbloqueado") })
    }
    setCargando(false)
  }

  const bloquear = async () => {
    setCargando(true)
    const result = await bloquearUsuario(usuarioId)
    if (result.error) {
      toast({ title: t("No se pudo bloquear"), description: result.error ? t(result.error) : undefined, variant: "destructive" })
    } else {
      setBloqueado(true)
      onEstado?.(true)
      toast({ title: t("Usuario bloqueado"), description: t("Ya no podréis iniciar ni continuar conversaciones.") })
    }
    setCargando(false)
  }

  if (!visible) return null

  if (bloqueado) {
    return (
      <Button variant="outline" className={className} onClick={desbloquear} disabled={cargando}>
        {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
        {t("Desbloquear")}
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className={className} disabled={cargando}>
          {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
          {t("Bloquear")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("¿Bloquear a este usuario?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("No podréis iniciar ni continuar conversaciones. Puedes desbloquearlo más adelante desde su perfil. Si ha infringido las normas, repórtalo también para que el equipo de Diime pueda revisarlo.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction onClick={bloquear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {t("Bloquear usuario")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
