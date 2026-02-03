"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Star, ThumbsUp, MessageSquare, Plus } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { crearReview } from "@/app/actions/reviews"
import { useToast } from "@/hooks/use-toast"

interface Review {
  id: number
  clientName: string
  clientAvatar: string
  rating: number
  date: string
  comment: string
  projectType: string
  helpfulCount?: number
}

export default function ProfileReviews({
  reviews,
  rating,
  totalReviews,
  profesionalId,
  canReview = false,
}: {
  reviews: Review[]
  rating: number
  totalReviews: number
  profesionalId?: string
  canReview?: boolean
}) {
  const [helpfulCounts, setHelpfulCounts] = useState<Record<number, number>>(
    reviews.reduce(
      (acc, review) => {
        acc[review.id] = review.helpfulCount || 0
        return acc
      },
      {} as Record<number, number>,
    ),
  )
  const [markedHelpful, setMarkedHelpful] = useState<Set<number>>(new Set())
  const [showReviewDialog, setShowReviewDialog] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState("")
  const [reviewProjectType, setReviewProjectType] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const handleMarkHelpful = (reviewId: number) => {
    if (markedHelpful.has(reviewId)) {
      setHelpfulCounts((prev) => ({
        ...prev,
        [reviewId]: prev[reviewId] - 1,
      }))
      setMarkedHelpful((prev) => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
    } else {
      setHelpfulCounts((prev) => ({
        ...prev,
        [reviewId]: prev[reviewId] + 1,
      }))
      setMarkedHelpful((prev) => new Set(prev).add(reviewId))
    }
  }

  const handleSubmitReview = async () => {
    if (!profesionalId || !reviewComment.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    const result = await crearReview({
      profesional_id: profesionalId,
      rating: reviewRating,
      comentario: reviewComment,
      proyecto_tipo: reviewProjectType,
    })

    setSubmitting(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Reseña enviada",
        description: "Tu valoración ha sido publicada",
      })
      setShowReviewDialog(false)
      setReviewComment("")
      setReviewProjectType("")
      setReviewRating(5)
      window.location.reload()
    }
  }

  const ratingDistribution = [5, 4, 3, 2, 1].map((stars) => {
    const count = reviews.filter((r) => Math.floor(r.rating) === stars).length
    const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0
    return { stars, count, percentage }
  })

  const averageByCategory = reviews.reduce(
    (acc, review) => {
      if (!acc[review.projectType]) {
        acc[review.projectType] = { total: 0, count: 0 }
      }
      acc[review.projectType].total += review.rating
      acc[review.projectType].count += 1
      return acc
    },
    {} as Record<string, { total: number; count: number }>,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Valoraciones y Opiniones de Clientes</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              <MessageSquare className="h-3 w-3 mr-1" />
              {totalReviews} reseñas
            </Badge>
            {canReview && (
              <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Dejar Reseña
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dejar una Valoración</DialogTitle>
                    <DialogDescription>Comparte tu experiencia con este profesional</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Valoración</Label>
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button key={star} onClick={() => setReviewRating(star)} className="focus:outline-none">
                            <Star
                              className={`h-8 w-8 cursor-pointer transition-colors ${
                                star <= reviewRating ? "fill-amber-500 text-amber-500" : "text-gray-300"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="project-type">Tipo de Proyecto</Label>
                      <input
                        id="project-type"
                        value={reviewProjectType}
                        onChange={(e) => setReviewProjectType(e.target.value)}
                        placeholder="Ej: Instalación Eléctrica"
                        className="w-full mt-1 px-3 py-2 border rounded-md"
                      />
                    </div>
                    <div>
                      <Label htmlFor="comment">Comentario</Label>
                      <Textarea
                        id="comment"
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Comparte los detalles de tu experiencia..."
                        rows={4}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSubmitReview} disabled={submitting}>
                      {submitting ? "Enviando..." : "Publicar Reseña"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-8 mb-8 pb-8 border-b">
          <div className="text-center md:text-left bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 p-6 rounded-lg">
            <div className="text-6xl font-bold mb-2 text-amber-600 dark:text-amber-400">{rating}</div>
            <div className="flex items-center justify-center md:justify-start gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-6 w-6 ${star <= rating ? "fill-amber-500 text-amber-500" : "text-gray-300"}`}
                />
              ))}
            </div>
            <p className="text-sm font-medium">Valoración Media</p>
            <p className="text-xs text-muted-foreground mt-1">Basado en {totalReviews} opiniones verificadas</p>
          </div>

          <div className="flex-1 space-y-3">
            <h4 className="font-semibold mb-3">Distribución de Valoraciones</h4>
            {ratingDistribution.map(({ stars, count, percentage }) => (
              <div key={stars} className="flex items-center gap-3">
                <div className="flex items-center gap-1 w-24">
                  <span className="text-sm font-medium">{stars}</span>
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                </div>
                <Progress value={percentage} className="flex-1 h-2" />
                <span className="text-sm text-muted-foreground w-16 text-right">
                  {count} ({percentage.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {Object.keys(averageByCategory).length > 0 && (
          <div className="mb-8 pb-8 border-b">
            <h4 className="font-semibold mb-4">Valoraciones por Tipo de Proyecto</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(averageByCategory).map(([type, data]) => {
                const avg = data.total / data.count
                return (
                  <Card key={type} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{type}</span>
                      <Badge variant="outline">{data.count} reseñas</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                      <span className="font-bold">{avg.toFixed(1)}</span>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <h4 className="font-semibold mb-4">Opiniones de Clientes ({reviews.length})</h4>
          <div className="space-y-6">
            {reviews.map((review) => (
              <div key={review.id} className="pb-6 border-b last:border-0 last:pb-0">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={review.clientAvatar || "/placeholder.svg"} />
                    <AvatarFallback>{review.clientName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-base">{review.clientName}</p>
                        <p className="text-xs text-muted-foreground">{review.date}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950 px-3 py-1 rounded-full">
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        <span className="font-bold text-sm">{review.rating.toFixed(1)}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="mb-3">
                      {review.projectType}
                    </Badge>
                    <p className="text-sm leading-relaxed mb-3">{review.comment}</p>
                    <button
                      onClick={() => handleMarkHelpful(review.id)}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        markedHelpful.has(review.id)
                          ? "text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ThumbsUp className={`h-3 w-3 ${markedHelpful.has(review.id) ? "fill-current" : ""}`} />
                      <span>
                        {markedHelpful.has(review.id) ? "Marcado como útil" : "Útil"} ({helpfulCounts[review.id]})
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
