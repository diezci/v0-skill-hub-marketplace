"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, Check, LockKeyhole, Loader2 } from "lucide-react"
import { aceptarInvitacionEmpresa } from "@/app/actions/empresa-workspace"
import { useT, useIdioma } from "@/components/idioma-provider"
import { localeDe } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NOMBRES_ROL_EMPRESA, PERMISOS_EMPRESA, type ResultadoEmpresa, type InvitacionEmpresa } from "@/lib/empresas/types"

export function AceptarInvitacionEmpresa({ token, resultado }: { token: string; resultado: ResultadoEmpresa<{ invitacion: InvitacionEmpresa; empresaNombre: string; coincideEmail: boolean }> }) {
  const t = useT()
  const { idioma } = useIdioma()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [aceptada, setAceptada] = useState(false)
  const data = resultado.data
  const disponible = !!data && data.invitacion.estado === "pendiente" && data.coincideEmail && new Date(data.invitacion.expiraEn).getTime() > Date.now()
  function aceptar() {
    setError("")
    startTransition(async () => {
      try {
        const respuesta = await aceptarInvitacionEmpresa(token)
        if (respuesta.error) { setError(respuesta.error); return }
        setAceptada(true); router.refresh()
      } catch { setError(t("No se pudo aceptar la invitación. Vuelve a intentarlo.")) }
    })
  }
  return <div className="container mx-auto max-w-xl px-4 py-10"><Card><CardHeader><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{aceptada ? <Check className="h-7 w-7" /> : <Building2 className="h-7 w-7" />}</div><CardTitle className="text-2xl"><h1>{t(aceptada ? "Ya formas parte del equipo" : "Una invitación para trabajar juntos")}</h1></CardTitle><CardDescription>{data ? data.empresaNombre : t("Invitación de empresa")}</CardDescription></CardHeader><CardContent className="space-y-5">
    {resultado.error && <p role="alert" className="text-sm text-destructive">{t(resultado.error)}</p>}
    {aceptada ? <><p className="text-sm text-muted-foreground">{t("Tu cuenta puede actuar en nombre de la empresa con los permisos concedidos.")}</p><Button asChild><Link href="/mi-empresa">{t("Entrar en Mi empresa")}</Link></Button></> : data && <>
      <div className="rounded-xl border bg-muted/30 p-4"><p className="font-medium">{data.invitacion.nombre}</p><p className="mt-1 break-all text-sm text-muted-foreground">{data.invitacion.email}</p><p className="mt-3 text-sm">{t(NOMBRES_ROL_EMPRESA[data.invitacion.rol])}</p><p className="mt-1 text-xs text-muted-foreground">{t("Caduca")}: {new Date(data.invitacion.expiraEn).toLocaleDateString(localeDe(idioma), { timeZone: "Europe/Madrid" })}</p></div>
      <div><h2 className="text-sm font-semibold">{t("Podrás actuar con estos permisos")}</h2><ul className="mt-3 space-y-2">{PERMISOS_EMPRESA.filter((p) => data.invitacion.permisos[p.clave]).map((p) => <li key={p.clave} className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="h-4 w-4 shrink-0 text-primary" />{t(p.titulo)}</li>)}</ul></div>
      {!data.coincideEmail && <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />{t("Esta invitación pertenece a otra cuenta. Inicia sesión con el correo indicado para aceptarla.")}</p>}
      {data.invitacion.estado !== "pendiente" && <p role="status" className="text-sm text-muted-foreground">{t("Esta invitación ya no está disponible.")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <Button disabled={!disponible || pending} onClick={aceptar} className="w-full">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Aceptar y unirme a la empresa")}</Button>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("Tu cuenta sigue siendo personal. La empresa conservará el historial de las acciones que realices en su nombre.")}</p>
    </>}
    {!aceptada && <Button asChild variant="ghost" className="w-full"><Link href="/empresa/reformas-garcia">{t("Ver perfil de la empresa")}</Link></Button>}
  </CardContent></Card></div>
}
