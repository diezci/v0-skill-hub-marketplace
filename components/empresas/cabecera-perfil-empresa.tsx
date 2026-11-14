"use client"

import type { ComponentProps, ReactNode } from "react"
import { Building2, Check, ImageIcon, Loader2, Pencil, X } from "lucide-react"
import { useT } from "@/components/idioma-provider"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { ProfileHeader } from "@/components/profile-header"
import styles from "./perfil-empresa-editor.module.css"

export function CabeceraPerfilEmpresa({ coverUrl, coverAlt, coverActions, avatar, avatarActions, children }: ComponentProps<typeof ProfileHeader>) {
  const t = useT()
  return <section className={styles.identity} aria-label={t("Presentación de la empresa")}>
    <div className={styles.cover} data-editable={coverActions ? "" : undefined}>
      {coverUrl ? <img src={coverUrl} alt={coverAlt} className="absolute inset-0 h-full w-full object-cover" /> : <div className={styles.coverPlaceholder}>
        <span className="flex items-center gap-2 text-xs font-medium"><Building2 className="size-4" aria-hidden="true" />{t("Tu empresa en Diime")}</span>
        <p className="mt-2 max-w-sm text-lg font-medium sm:text-xl">{t("Un espacio para mostrar lo que hacéis.")}</p>
      </div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" aria-hidden="true" />
      {coverActions}
    </div>
    <div className="relative flex flex-col gap-5 px-5 pb-6 sm:px-7 sm:pb-7 md:flex-row md:items-start md:gap-6">
      <div className="relative -mt-10 w-fit shrink-0 self-start sm:-mt-11">{avatar}{avatarActions}</div>
      <div className="min-w-0 flex-1 md:pt-5">{children}</div>
    </div>
  </section>
}

export function AvatarPerfilEmpresa({ src, nombre }: { src: string; nombre: string }) {
  return <Avatar className="size-24 rounded-2xl border-4 border-background shadow-md sm:size-28">
    <AvatarImage src={src} alt={nombre} className="object-cover" />
    <AvatarFallback className="rounded-xl bg-background text-primary"><Building2 className="size-10" aria-hidden="true" /><span className="sr-only">{nombre}</span></AvatarFallback>
  </Avatar>
}

export function BarraEdicionEmpresa({ editando, guardando, subiendo, puedeEditar, onEditar, onGuardar, onCancelar }: {
  editando: boolean
  guardando: boolean
  subiendo: boolean
  puedeEditar: boolean
  onEditar: () => void
  onGuardar: () => void
  onCancelar: () => void
}) {
  const t = useT()
  return <div className={`${styles.editBar} ${editando ? styles.editing : ""}`}>
    <div className="flex min-w-0 items-start gap-3">
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">{editando ? <Pencil className="size-4" aria-hidden="true" /> : <ImageIcon className="size-5" aria-hidden="true" />}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t(editando ? "Editando el perfil" : "Perfil de la empresa")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(editando ? "Guarda al terminar o cancela para conservar la versión anterior." : puedeEditar ? "Edita la presentación, las imágenes, los servicios y los datos de contacto." : "Consulta la información que presenta la empresa a sus clientes.")}</p>
      </div>
    </div>
    {puedeEditar && <div className="flex shrink-0 gap-2">
      {editando ? <>
        <Button type="button" variant="outline" size="sm" disabled={guardando || subiendo} onClick={onCancelar}><X className="size-4" aria-hidden="true" />{t("Cancelar")}</Button>
        <Button type="button" size="sm" disabled={guardando || subiendo} onClick={onGuardar}>{guardando || subiendo ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}{t(subiendo ? "Subiendo..." : guardando ? "Guardando..." : "Guardar cambios")}</Button>
      </> : <Button type="button" size="sm" onClick={onEditar}><Pencil className="size-4" aria-hidden="true" />{t("Editar perfil")}</Button>}
    </div>}
  </div>
}

export function EditarSeccionEmpresa({ children, onEditar }: { children: ReactNode; onEditar: () => void }) {
  return <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-xs font-medium text-primary" onClick={onEditar}>
    <Pencil className="size-3.5" aria-hidden="true" />{children}
  </Button>
}
