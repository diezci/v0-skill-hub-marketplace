"use client"

import type React from "react"
import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { Send, Paperclip, X, MapPin, Euro, Clock } from "lucide-react"
import { uploadFile } from "@/lib/upload-helpers"
import { crearSolicitud } from "@/app/actions/solicitudes"
import { useRouter } from "next/navigation"
import { OpcionesCategorias } from "@/components/select-categorias-opciones"
import { PROVINCIAS_ES } from "@/lib/provincias"

const formSchema = z.object({
  category: z.string().min(1, { message: "Selecciona una categoría" }),
  title: z.string().min(5, { message: "Mínimo 5 caracteres" }),
  description: z.string().min(20, { message: "Mínimo 20 caracteres" }),
  location: z.string().min(2, { message: "Ingresa tu ubicación" }),
  budget: z.string().min(1, { message: "Selecciona un presupuesto" }),
  urgency: z.string().min(1, { message: "Indica la urgencia" }),
})

const provincias = PROVINCIAS_ES.map((provincia) => ({ provincia }))

interface Props {
  embedded?: boolean
}

const SolicitudServicioForm = ({ embedded = false }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "",
      title: "",
      description: "",
      location: "",
      budget: "",
      urgency: "",
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)
    try {
      const uploadResults = await Promise.all(attachedFiles.map((file) => uploadFile(file)))
      // Si falla una subida no se publica la demanda: los profesionales verían
      // una demanda sin las fotos que creías haber adjuntado.
      if (uploadResults.some((r) => r === null)) {
        toast({
          title: "No se pudieron subir los archivos",
          description: "Tu demanda no se ha publicado. Inténtalo de nuevo o quita los adjuntos.",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }
      const successfulUploads = uploadResults.map((r) => r!.url)

      const result = await crearSolicitud({
        categoria_id: values.category,
        titulo: values.title,
        descripcion: values.description,
        ubicacion: values.location,
        // "0-500" → hasta 500€; "5000+" → más de 5.000€ (sin inventar un tope).
        presupuesto_min: Number.parseInt(values.budget.split("-")[0]) || undefined,
        presupuesto_max: values.budget.includes("+") ? undefined : Number.parseInt(values.budget.split("-")[1]),
        urgencia: values.urgency,
        archivos_adjuntos: successfulUploads,
      })

      if (result.error) throw new Error(result.error)

      toast({
        title: "¡Proyecto publicado!",
        description: "Los profesionales ya pueden ver tu solicitud y enviarte ofertas.",
      })
      form.reset()
      setAttachedFiles([])
      router.push("/mis-solicitudes")
    } catch (error) {
      toast({
        title: "No se pudo publicar",
        description: error instanceof Error ? error.message : "Hubo un problema. Inténtalo de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-emerald-500" />
                  Tipo de Servicio
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="¿Qué necesitas?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <OpcionesCategorias />
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-500" />
                  Provincia donde se realizará el servicio
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Provincia de realización del servicio" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {provincias.map((prov) => (
                      <SelectItem key={prov.provincia} value={`${prov.provincia}`}>
                        {prov.provincia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título del Proyecto</FormLabel>
              <FormControl>
                <Input placeholder="Ej: Reforma completa de baño" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe el trabajo que necesitas..."
                  className="min-h-[100px] resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="budget"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Euro className="h-4 w-4 text-emerald-500" />
                  Presupuesto
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Rango estimado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="0-500">Menos de 500€</SelectItem>
                    <SelectItem value="500-1000">500€ - 1.000€</SelectItem>
                    <SelectItem value="1000-2500">1.000€ - 2.500€</SelectItem>
                    <SelectItem value="2500-5000">2.500€ - 5.000€</SelectItem>
                    <SelectItem value="5000+">Más de 5.000€</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="urgency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  Urgencia
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="¿Cuándo lo necesitas?" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {/* Los valores deben coincidir con la constraint de la BD: baja | media | alta | urgente */}
                    <SelectItem value="urgente">Urgente (1-3 días)</SelectItem>
                    <SelectItem value="alta">Esta semana</SelectItem>
                    <SelectItem value="media">Este mes</SelectItem>
                    <SelectItem value="baja">Flexible</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* File attachments */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="files"
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={isSubmitting}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("files")?.click()}
              disabled={isSubmitting}
            >
              <Paperclip className="w-4 h-4 mr-2" />
              Adjuntar fotos
            </Button>
            {attachedFiles.length > 0 && (
              <span className="text-sm text-muted-foreground">{attachedFiles.length} archivo(s)</span>
            )}
          </div>

          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full text-sm">
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} className="hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            "Publicando..."
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Publicar Proyecto
            </>
          )}
        </Button>
      </form>
    </Form>
  )

  if (embedded) {
    return (
      <Card className="max-w-3xl mx-auto shadow-xl border-0 bg-card/80 backdrop-blur">
        <CardContent className="p-6 md:p-8">{formContent}</CardContent>
      </Card>
    )
  }

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-6">{formContent}</CardContent>
        </Card>
      </div>
    </section>
  )
}

export default SolicitudServicioForm
