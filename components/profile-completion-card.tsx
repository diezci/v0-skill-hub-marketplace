"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, Sparkles, ArrowRight } from "lucide-react"

interface CompletionItem {
  label: string
  done: boolean
}

interface ProfileCompletionCardProps {
  items: CompletionItem[]
  className?: string
}

export function ProfileCompletionCard({ items, className }: ProfileCompletionCardProps) {
  const completed = items.filter((i) => i.done).length
  const total = items.length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

  if (percentage === 100) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex items-center gap-4">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Perfil al 100%</p>
            <p className="text-sm text-muted-foreground">
              Tu perfil esta completo y listo para atraer clientes
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold mb-1">Completa tu perfil</h3>
            <p className="text-sm text-muted-foreground">
              Los perfiles completos reciben hasta 3x mas contactos
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold tabular-nums">{percentage}%</div>
            <div className="text-xs text-muted-foreground">{completed}/{total}</div>
          </div>
        </div>

        <Progress value={percentage} className="h-2 mb-5" />

        <ul className="space-y-2 mb-5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 className="size-4 text-primary shrink-0" />
              ) : (
                <Circle className="size-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className={item.done ? "text-muted-foreground line-through" : ""}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>

        <Button asChild className="w-full" size="sm">
          <Link href="/mi-perfil">
            Completar perfil
            <ArrowRight className="size-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
