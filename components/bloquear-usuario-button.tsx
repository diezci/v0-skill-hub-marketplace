"use client"

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
  const [visible, setVisible] = useState(false)
  const [bloqueado, setBloqueado] = useState(false)
  const [cargando, setCargando] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    let activo = true
    obtenerEstadoBloqueo(usuarioId).then((estado) => {
      if (!activo) return
      setVisible(!!estado.autenticado && !estado.esMismoUsuario && !estado.pendienteMigracion)
      setBloqueado(!!estado.bloqueadoPorMi)
      onEstado?.(!!estado.bloqueadoPorMi || !!estado.meHaBloqueado)
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
      toast({ title: "No se pudo desbloquear", description: result.error, variant: "destructive" })
    } else {
      setBloqueado(false)
      onEstado?.(false)
      toast({ title: "Usuario desbloqueado" })
    }
    setCargando(false)
  }

  const bloquear = async () => {
    setCargando(true)
    const result = await bloquearUsuario(usuarioId)
    if (result.error) {
      toast({ title: "No se pudo bloquear", description: result.error, variant: "destructive" })
    } else {
      setBloqueado(true)
      onEstado?.(true)
      toast({ title: "Usuario bloqueado", description: "Ya no podréis iniciar ni continuar conversaciones." })
    }
    setCargando(false)
  }

  if (!visible) return null

  if (bloqueado) {
    return (
      <Button variant="outline" className={className} onClick={desbloquear} disabled={cargando}>
        {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
        Desbloquear
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className={className} disabled={cargando}>
          {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
          Bloquear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Bloquear a este usuario?</AlertDialogTitle>
          <AlertDialogDescription>
            No podréis iniciar ni continuar conversaciones. Puedes desbloquearlo más adelante desde su perfil.
            Si ha infringido las normas, repórtalo también para que el equipo de Diime pueda revisarlo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={bloquear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Bloquear usuario
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
