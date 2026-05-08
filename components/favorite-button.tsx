"use client"

import { useState, useTransition } from "react"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toggleFavorito } from "@/app/actions/favoritos"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface FavoriteButtonProps {
  profesionalId: string
  initialIsFavorite?: boolean
  variant?: "default" | "ghost" | "outline"
  size?: "default" | "icon" | "sm"
  showLabel?: boolean
  className?: string
}

export function FavoriteButton({
  profesionalId,
  initialIsFavorite = false,
  variant = "outline",
  size = "icon",
  showLabel = false,
  className,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    startTransition(async () => {
      const result = await toggleFavorito(profesionalId)

      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      setIsFavorite(!!result.isFavorite)
      toast({
        title: result.isFavorite ? "Anadido a favoritos" : "Eliminado de favoritos",
        description: result.isFavorite
          ? "Puedes ver tus profesionales favoritos en cualquier momento"
          : "El profesional ya no esta en tu lista",
      })
    })
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "transition-all",
        isFavorite && "text-rose-500 hover:text-rose-600 border-rose-200",
        className,
      )}
      aria-label={isFavorite ? "Quitar de favoritos" : "Anadir a favoritos"}
    >
      <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
      {showLabel && <span className="ml-2">{isFavorite ? "Guardado" : "Guardar"}</span>}
    </Button>
  )
}
