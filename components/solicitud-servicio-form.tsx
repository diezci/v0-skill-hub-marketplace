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

const formSchema = z.object({
  category: z.string().min(1, { message: "Selecciona una categoría" }),
  title: z.string().min(5, { message: "Mínimo 5 caracteres" }),
  description: z.string().min(20, { message: "Mínimo 20 caracteres" }),
  location: z.string().min(2, { message: "Ingresa tu ubicación" }),
  budget: z.string().min(1, { message: "Selecciona un presupuesto" }),
  urgency: z.string().min(1, { message: "Indica la urgencia" }),
})

const categories = [
  "Arquitecto",
  "Diseñador de Interiores",
  "Contratista",
  "Albañil",
  "Carpintero",
  "Fontanero",
  "Electricista",
  "Pintor",
  "Yesero/Pladurista",
  "Instalador de Suelos",
  "Climatización",
  "Cerrajero",
  "Marmolista",
  "Instalador de Ventanas",
  "Ebanista",
  "Tapicero",
  "Jardinero",
  "Domótica",
  "Impermeabilizaciones",
]

const provincias = [
  { provincia: "Álava", codigo: "01" },
  { provincia: "Albacete", codigo: "02" },
  { provincia: "Alicante", codigo: "03" },
  { provincia: "Almería", codigo: "04" },
  { provincia: "Ávila", codigo: "05" },
  { provincia: "Badajoz", codigo: "06" },
  { provincia: "Islas Baleares", codigo: "07" },
  { provincia: "Barcelona", codigo: "08" },
  { provincia: "Burgos", codigo: "09" },
  { provincia: "Cáceres", codigo: "10" },
  { provincia: "Cádiz", codigo: "11" },
  { provincia: "Castellón", codigo: "12" },
  { provincia: "Ciudad Real", codigo: "13" },
  { provincia: "Córdoba", codigo: "14" },
  { provincia: "Cuenca", codigo: "16" },
  { provincia: "Girona", codigo: "17" },
  { provincia: "Granada", codigo: "18" },
  { provincia: "Guadalajara", codigo: "19" },
  { provincia: "Guipúzcoa", codigo: "20" },
  { provincia: "Huelva", codigo: "21" },
  { provincia: "Huesca", codigo: "22" },
  { provincia: "Jaén", codigo: "23" },
  { provincia: "La Coruña", codigo: "15" },
  { provincia: "La Rioja", codigo: "26" },
  { provincia: "Las Palmas", codigo: "35" },
  { provincia: "León", codigo: "24" },
  { provincia: "Lleida", codigo: "25" },
  { provincia: "Lugo", codigo: "27" },
  { provincia: "Madrid", codigo: "28" },
  { provincia: "Málaga", codigo: "29" },
  { provincia: "Murcia", codigo: "30" },
  { provincia: "Navarra", codigo: "31" },
  { provincia: "Ourense", codigo: "32" },
  { provincia: "Asturias", codigo: "33" },
  { provincia: "Palencia", codigo: "34" },
  { provincia: "Pontevedra", codigo: "36" },
  { provincia: "Segovia", codigo: "40" },
  { provincia: "Sevilla", codigo: "41" },
  { provincia: "Soria", codigo: "42" },
  { provincia: "Tarragona", codigo: "43" },
  { provincia: "Teruel", codigo: "44" },
  { provincia: "Toledo", codigo: "45" },
  { provincia: "Valencia", codigo: "46" },
  { provincia: "Valladolid", codigo: "47" },
  { provincia: "Vizcaya", codigo: "48" },
  { provincia: "Zamora", codigo: "49" },
  { provincia: "Zaragoza", codigo: "50" },
  { provincia: "Ceuta", codigo: "51" },
  { provincia: "Melilla", codigo: "52" },
]

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
      const uploadPromises = attachedFiles.map((file) => uploadFile(file))
      const uploadResults = await Promise.all(uploadPromises)
      const successfulUploads = uploadResults.filter((r) => r !== null).map((r) => r!.url)

      const result = await crearSolicitud({
        categoria_id: values.category,
        titulo: values.title,
        descripcion: values.description,
        ubicacion: values.location,
        presupuesto_min: Number.parseInt(values.budget.split("-")[0]),
        presupuesto_max: values.budget.includes("+") ? 10000 : Number.parseInt(values.budget.split("-")[1]),
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
      router.push("/mis-proyectos")
    } catch (error) {
      toast({
        title: "Error",
        description: "Hubo un problema. Inténtalo de nuevo.",
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
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
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
                  Provincia
                </FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una provincia" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {provincias.map((prov) => (
                      <SelectItem key={prov.codigo} value={`${prov.provincia}`}>
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
                    <SelectItem value="urgente">Urgente (1-3 días)</SelectItem>
                    <SelectItem value="esta-semana">Esta semana</SelectItem>
                    <SelectItem value="este-mes">Este mes</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
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
