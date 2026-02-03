"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Trash2, Calendar, MapPin, Euro, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { crearItemPortfolio, obtenerPortfolioPorProfesional, eliminarItemPortfolio } from "@/app/actions/portfolio"
import { uploadFile } from "@/lib/upload-helpers"
import { useToast } from "@/hooks/use-toast"

export default function PortfolioManager({ profesionalId }: { profesionalId: string }) {
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()

  const [newItem, setNewItem] = useState({
    titulo: "",
    descripcion: "",
    imagen_url: "",
    categoria: "",
    fecha_completado: "",
    ubicacion: "",
    duracion: "",
    presupuesto: "",
  })

  useEffect(() => {
    loadPortfolio()
  }, [])

  const loadPortfolio = async () => {
    setLoading(true)
    const result = await obtenerPortfolioPorProfesional(profesionalId)
    if (result.data) {
      setPortfolio(result.data)
    }
    setLoading(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const result = await uploadFile(file)
    setUploading(false)

    if (result) {
      setNewItem({ ...newItem, imagen_url: result.url })
      toast({
        title: "Imagen subida",
        description: "La imagen del proyecto se ha subido correctamente.",
      })
    } else {
      toast({
        title: "Error",
        description: "No se pudo subir la imagen.",
        variant: "destructive",
      })
    }
  }

  const handleSubmit = async () => {
    if (!newItem.titulo || !newItem.descripcion || !newItem.imagen_url) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa título, descripción e imagen.",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    const result = await crearItemPortfolio(newItem)
    setSubmitting(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Proyecto añadido",
        description: "El proyecto se ha añadido a tu portfolio.",
      })
      setShowDialog(false)
      setNewItem({
        titulo: "",
        descripcion: "",
        imagen_url: "",
        categoria: "",
        fecha_completado: "",
        ubicacion: "",
        duracion: "",
        presupuesto: "",
      })
      loadPortfolio()
    }
  }

  const handleDelete = async (itemId: string) => {
    const result = await eliminarItemPortfolio(itemId)
    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Proyecto eliminado",
        description: "El proyecto se ha eliminado de tu portfolio.",
      })
      loadPortfolio()
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portfolio de Proyectos</CardTitle>
            <CardDescription>Gestiona los proyectos completados que aparecen en tu perfil</CardDescription>
          </div>
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Añadir Proyecto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Añadir Proyecto al Portfolio</DialogTitle>
                <DialogDescription>Completa la información del proyecto completado</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="titulo">Título del Proyecto *</Label>
                  <Input
                    id="titulo"
                    value={newItem.titulo}
                    onChange={(e) => setNewItem({ ...newItem, titulo: e.target.value })}
                    placeholder="Ej: Reforma integral de cocina"
                  />
                </div>
                <div>
                  <Label htmlFor="descripcion">Descripción *</Label>
                  <Textarea
                    id="descripcion"
                    value={newItem.descripcion}
                    onChange={(e) => setNewItem({ ...newItem, descripcion: e.target.value })}
                    placeholder="Describe el proyecto, los desafíos y resultados..."
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="imagen">Imagen del Proyecto *</Label>
                  {newItem.imagen_url ? (
                    <div className="relative mt-2">
                      <img
                        src={newItem.imagen_url || "/placeholder.svg"}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-2 right-2"
                        onClick={() => document.getElementById("portfolio-image-upload")?.click()}
                      >
                        Cambiar Imagen
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById("portfolio-image-upload")?.click()}
                        disabled={uploading}
                        className="w-full"
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        {uploading ? "Subiendo..." : "Seleccionar Imagen"}
                      </Button>
                    </div>
                  )}
                  <input
                    id="portfolio-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="categoria">Categoría</Label>
                    <Input
                      id="categoria"
                      value={newItem.categoria}
                      onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value })}
                      placeholder="Ej: Albañilería"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fecha_completado">Fecha de Completado</Label>
                    <Input
                      id="fecha_completado"
                      type="date"
                      value={newItem.fecha_completado}
                      onChange={(e) => setNewItem({ ...newItem, fecha_completado: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ubicacion">Ubicación</Label>
                    <Input
                      id="ubicacion"
                      value={newItem.ubicacion}
                      onChange={(e) => setNewItem({ ...newItem, ubicacion: e.target.value })}
                      placeholder="Madrid, España"
                    />
                  </div>
                  <div>
                    <Label htmlFor="duracion">Duración</Label>
                    <Input
                      id="duracion"
                      value={newItem.duracion}
                      onChange={(e) => setNewItem({ ...newItem, duracion: e.target.value })}
                      placeholder="2 semanas"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="presupuesto">Presupuesto</Label>
                  <Input
                    id="presupuesto"
                    value={newItem.presupuesto}
                    onChange={(e) => setNewItem({ ...newItem, presupuesto: e.target.value })}
                    placeholder="5,000€"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Añadir Proyecto
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {portfolio.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No tienes proyectos en tu portfolio</p>
            <p className="text-sm mt-2">Añade proyectos completados para mostrar tu experiencia</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolio.map((item) => (
              <div key={item.id} className="group relative">
                <div className="relative h-48 overflow-hidden rounded-lg mb-3 shadow-md">
                  <img
                    src={item.imagen_url || "/placeholder.svg"}
                    alt={item.titulo}
                    className="w-full h-full object-cover"
                  />
                  {item.categoria && <Badge className="absolute top-3 right-3 shadow-lg">{item.categoria}</Badge>}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.titulo}</h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{item.descripcion}</p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {item.fecha_completado && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Completado: {new Date(item.fecha_completado).toLocaleDateString("es-ES")}</span>
                    </div>
                  )}
                  {item.ubicacion && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{item.ubicacion}</span>
                    </div>
                  )}
                  {item.presupuesto && (
                    <div className="flex items-center gap-1.5">
                      <Euro className="h-3.5 w-3.5" />
                      <span>Presupuesto: {item.presupuesto}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
