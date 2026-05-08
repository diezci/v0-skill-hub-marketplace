import { ShieldCheck, Award, Zap, Crown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TrustBadgesProps {
  verificado?: boolean
  totalTrabajos?: number
  ratingPromedio?: number
  totalResenas?: number
  size?: "sm" | "md"
  className?: string
}

interface BadgeDef {
  key: string
  label: string
  icon: typeof ShieldCheck
  classes: string
  show: boolean
}

export function TrustBadges({
  verificado,
  totalTrabajos = 0,
  ratingPromedio = 0,
  totalResenas = 0,
  size = "md",
  className,
}: TrustBadgesProps) {
  const badges: BadgeDef[] = [
    {
      key: "verified",
      label: "Verificado",
      icon: ShieldCheck,
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
      show: !!verificado,
    },
    {
      key: "top",
      label: "Top Rated",
      icon: Crown,
      classes: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
      show: ratingPromedio >= 4.8 && totalResenas >= 10,
    },
    {
      key: "experto",
      label: "Experto",
      icon: Award,
      classes: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900",
      show: totalTrabajos >= 50,
    },
    {
      key: "new",
      label: "Nuevo talento",
      icon: Sparkles,
      classes: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900",
      show: totalTrabajos < 5 && verificado === true,
    },
    {
      key: "reliable",
      label: "Respuesta rapida",
      icon: Zap,
      classes: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900",
      show: totalTrabajos >= 10 && ratingPromedio >= 4.5,
    },
  ]

  const visible = badges.filter((b) => b.show)
  if (visible.length === 0) return null

  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5 gap-1" : "text-sm px-2.5 py-1 gap-1.5"
  const iconSize = size === "sm" ? "size-3" : "size-3.5"

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map((badge) => {
        const Icon = badge.icon
        return (
          <span
            key={badge.key}
            className={cn(
              "inline-flex items-center font-medium rounded-full border",
              badge.classes,
              sizeClasses,
            )}
          >
            <Icon className={iconSize} />
            {badge.label}
          </span>
        )
      })}
    </div>
  )
}
