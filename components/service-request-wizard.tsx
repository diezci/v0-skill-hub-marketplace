"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { 
  Wrench, 
  MapPin, 
  Calendar, 
  Euro, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  Sparkles,
  Zap,
  Home,
  Paintbrush,
  Droplets,
  Flame,
  Building2,
  Trees,
  Shield,
  HardHat
} from "lucide-react"
import { crearSolicitud } from "@/app/actions/solicitudes"
import { useToast } from "@/hooks/use-toast"

const CATEGORIES = [
  { id: "fontaneria", name: "Fontanería", icon: Droplets, color: "bg-blue-500" },
  { id: "electricidad", name: "Electricidad", icon: Zap, color: "bg-yellow-500" },
  { id: "pintura", name: "Pintura", icon: Paintbrush, color: "bg-purple-500" },
  { id: "albanileria", name: "Albañilería", icon: Building2, color: "bg-orange-500" },
  { id: "carpinteria", name: "Carpintería", icon: Home, color: "bg-amber-700" },
  { id: "climatizacion", name: "Climatización", icon: Flame, color: "bg-red-500" },
  { id: "jardineria", name: "Jardinería", icon: Trees, color: "bg-green-500" },
  { id: "cerrajeria", name: "Cerrajería", icon: Shield, color: "bg-gray-600" },
  { id: "reformas", name: "Reformas integrales", icon: HardHat, color: "bg-emerald-600" },
  { id: "otros", name: "Otros servicios", icon: Wrench, color: "bg-slate-500" },
]

const URGENCY_OPTIONS = [
  { id: "urgente", name: "Urgente (1-3 días)", description: "Necesito ayuda lo antes posible" },
  { id: "pronto", name: "Pronto (1-2 semanas)", description: "Tengo algo de flexibilidad" },
  { id: "planificado", name: "Planificado (1+ mes)", description: "Estoy planificando a futuro" },
  { id: "flexible", name: "Flexible", description: "Sin fecha límite específica" },
]

interface WizardData {
  categoria: string
  descripcion: string
  ubicacion: string
  urgencia: string
  presupuestoMin: number
  presupuestoMax: number
  titulo: string
}

export default function ServiceRequestWizard() {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  
  const [data, setData] = useState<WizardData>({
    categoria: "",
    descripcion: "",
    ubicacion: "",
    urgencia: "",
    presupuestoMin: 100,
    presupuestoMax: 5000,
    titulo: "",
  })

  const totalSteps = 5

  const updateData = (field: keyof WizardData, value: string | number) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const canProceed = () => {
    switch (step) {
      case 1: return !!data.categoria
      case 2: return data.descripcion.length >= 20
      case 3: return !!data.ubicacion
      case 4: return !!data.urgencia
      case 5: return data.titulo.length >= 5
      default: return false
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    
    try {
      const result = await crearSolicitud({
        titulo: data.titulo,
        descripcion: data.descripcion,
        categoria_id: data.categoria,
        ubicacion: data.ubicacion,
        presupuesto_min: data.presupuestoMin,
        presupuesto_max: data.presupuestoMax,
        urgencia: data.urgencia,
      })

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        })
      } else {
        setIsComplete(true)
        toast({
          title: "Solicitud publicada",
          description: "Estamos buscando profesionales para tu proyecto",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la solicitud. Inténtalo de nuevo.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCategory = CATEGORIES.find(c => c.id === data.categoria)

  if (isComplete) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Tu solicitud está en marcha</h2>
          <p className="text-muted-foreground mb-6">
            Nuestra IA está buscando los mejores profesionales para tu proyecto. 
            Te notificaremos cuando recibas presupuestos.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => router.push("/mis-solicitudes")}>
              Ver mis solicitudes
            </Button>
            <Button onClick={() => router.push("/")}>
              Volver al inicio
            </Button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Paso {step} de {totalSteps}</span>
          <span className="text-sm font-medium">{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${(step / totalSteps) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 1: Category Selection */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-emerald-500" />
                  ¿Qué servicio necesitas?
                </CardTitle>
                <CardDescription>
                  Selecciona la categoría que mejor describe tu necesidad
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {CATEGORIES.map((category) => {
                    const Icon = category.icon
                    const isSelected = data.categoria === category.id
                    return (
                      <button
                        key={category.id}
                        onClick={() => updateData("categoria", category.id)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          isSelected 
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" 
                            : "border-border hover:border-emerald-300 hover:bg-muted/50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg ${category.color} flex items-center justify-center mb-2`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-medium text-sm">{category.name}</span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Description */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-500" />
                  Describe tu proyecto
                </CardTitle>
                <CardDescription>
                  Cuéntanos los detalles para que los profesionales puedan entender mejor tu necesidad
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedCategory && (
                  <Badge variant="secondary" className="mb-2">
                    {selectedCategory.name}
                  </Badge>
                )}
                <div>
                  <Label htmlFor="descripcion">Descripción del trabajo</Label>
                  <Textarea
                    id="descripcion"
                    value={data.descripcion}
                    onChange={(e) => updateData("descripcion", e.target.value)}
                    placeholder="Ej: Necesito reparar una fuga en el baño principal. La tubería está debajo del lavabo y gotea constantemente..."
                    className="mt-2 min-h-[150px]"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Mínimo 20 caracteres ({data.descripcion.length}/20)
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Location */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-500" />
                  ¿Dónde necesitas el servicio?
                </CardTitle>
                <CardDescription>
                  Indica la ubicación para encontrar profesionales en tu zona
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Label htmlFor="ubicacion">Ciudad o código postal</Label>
                  <Input
                    id="ubicacion"
                    value={data.ubicacion}
                    onChange={(e) => updateData("ubicacion", e.target.value)}
                    placeholder="Ej: Madrid, Barcelona, 28001..."
                    className="mt-2"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Urgency */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-500" />
                  ¿Cuándo lo necesitas?
                </CardTitle>
                <CardDescription>
                  Esto ayuda a los profesionales a organizar su agenda
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {URGENCY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => updateData("urgencia", option.id)}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        data.urgencia === option.id
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                          : "border-border hover:border-emerald-300"
                      }`}
                    >
                      <span className="font-medium">{option.name}</span>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Budget and Title */}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Euro className="w-5 h-5 text-emerald-500" />
                  Presupuesto y título
                </CardTitle>
                <CardDescription>
                  Indica tu rango de presupuesto y un título para tu solicitud
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="titulo">Título de la solicitud</Label>
                  <Input
                    id="titulo"
                    value={data.titulo}
                    onChange={(e) => updateData("titulo", e.target.value)}
                    placeholder="Ej: Reparación de fuga en baño"
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label>Rango de presupuesto</Label>
                  <div className="mt-4 px-2">
                    <Slider
                      value={[data.presupuestoMin, data.presupuestoMax]}
                      onValueChange={([min, max]) => {
                        updateData("presupuestoMin", min)
                        updateData("presupuestoMax", max)
                      }}
                      min={50}
                      max={50000}
                      step={50}
                      className="mb-4"
                    />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{data.presupuestoMin.toLocaleString()}€</span>
                      <span className="font-medium">{data.presupuestoMax.toLocaleString()}€</span>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                  <h4 className="font-medium text-sm">Resumen de tu solicitud</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Categoría:</strong> {selectedCategory?.name}</p>
                    <p><strong>Ubicación:</strong> {data.ubicacion}</p>
                    <p><strong>Urgencia:</strong> {URGENCY_OPTIONS.find(o => o.id === data.urgencia)?.name}</p>
                    <p><strong>Presupuesto:</strong> {data.presupuestoMin.toLocaleString()}€ - {data.presupuestoMax.toLocaleString()}€</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 1}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>

        {step < totalSteps ? (
          <Button
            onClick={() => setStep(s => s + 1)}
            disabled={!canProceed()}
          >
            Siguiente
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canProceed() || isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Publicando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Publicar y buscar profesionales
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
