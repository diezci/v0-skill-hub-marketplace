"use client"

import { useT } from "@/components/idioma-provider"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Mail, MailX, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { actualizarPreferenciasEmails } from "@/app/actions/notificaciones"
import {
  OPCIONES_EMAIL,
  type CategoriaEmail,
  type PreferenciasEmail,
} from "@/lib/preferencias-notificaciones"

export function PreferenciaEmails({
  inicial,
  esProfesional,
}: {
  inicial: PreferenciasEmail
  esProfesional: boolean
}) {
  const t = useT()
  const [preferencias, setPreferencias] = useState(inicial)
  const [guardando, setGuardando] = useState<keyof PreferenciasEmail | null>(null)
  const { toast } = useToast()

  const guardar = async (siguientes: PreferenciasEmail, clave: keyof PreferenciasEmail) => {
    const anteriores = preferencias
    setPreferencias(siguientes)
    setGuardando(clave)
    try {
      const res = await actualizarPreferenciasEmails(siguientes)
      if (!res?.error) return true
      setPreferencias(anteriores)
      toast({ title: t("No se pudo guardar"), description: res.error ? t(res.error) : undefined, variant: "destructive" })
      return false
    } catch {
      setPreferencias(anteriores)
      toast({
        title: t("No se pudo guardar"),
        description: t("Comprueba tu conexión y vuelve a intentarlo."),
        variant: "destructive",
      })
      return false
    } finally {
      setGuardando(null)
    }
  }

  const alternarGeneral = async () => {
    const activo = !preferencias.emailActivo
    if (await guardar({ ...preferencias, emailActivo: activo }, "emailActivo")) {
      toast({
        title: activo ? t("Avisos por correo activados") : t("Avisos por correo desactivados"),
        description: activo
          ? t("Recibirás las categorías que tienes seleccionadas.")
          : t("Seguirás viendo todos los avisos dentro de Diime."),
      })
    }
  }

  const alternarCategoria = async (clave: CategoriaEmail, activo: boolean) => {
    const opcion = OPCIONES_EMAIL.find((item) => item.clave === clave)
    if (await guardar({ ...preferencias, [clave]: activo }, clave)) {
      toast({
        title: activo ? t("Categoría activada") : t("Categoría desactivada"),
        description: opcion?.titulo ? t(opcion.titulo) : undefined,
      })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("Avisos por correo")}</h3>
          <p className="text-sm text-muted-foreground">
            {preferencias.emailActivo
              ? t("Elige qué novedades quieres recibir también en tu correo.")
              : t("No recibes correos. Todos los avisos siguen apareciendo dentro de Diime.")}
          </p>
        </div>
        <Button
          variant={preferencias.emailActivo ? "outline" : "default"}
          size="sm"
          onClick={() => void alternarGeneral()}
          disabled={guardando !== null}
        >
          {guardando === "emailActivo" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : preferencias.emailActivo ? (
            <>
              <MailX className="mr-1.5 h-4 w-4" />
              {t("Desactivar todo")}
            </>
          ) : (
            <>
              <Mail className="mr-1.5 h-4 w-4" />
              {t("Activar")}
            </>
          )}
        </Button>
      </div>

      <div className="divide-y rounded-lg border">
        {OPCIONES_EMAIL.filter((opcion) => !opcion.soloProfesionales || esProfesional).map(
          (opcion) => (
            <label
              key={opcion.clave}
              className={`flex cursor-pointer items-start gap-3 p-3.5 ${
                !preferencias.emailActivo ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <Checkbox
                className="mt-0.5"
                checked={preferencias[opcion.clave]}
                disabled={!preferencias.emailActivo || guardando !== null}
                onCheckedChange={(valor) => void alternarCategoria(opcion.clave, valor === true)}
                aria-label={t(opcion.titulo)}
              />
              <span>
                <span className="block text-sm font-medium">{t(opcion.titulo)}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(opcion.descripcion)}
                </span>
              </span>
              {guardando === opcion.clave && <Loader2 className="ml-auto mt-0.5 h-4 w-4 animate-spin" />}
            </label>
          ),
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("Los mensajes de chat no generan un correo por cada mensaje; siguen llegando dentro de Diime y mediante las notificaciones del dispositivo.")}
      </p>
    </div>
  )
}
