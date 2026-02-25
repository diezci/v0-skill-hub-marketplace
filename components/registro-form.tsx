"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { registrarCliente } from "@/app/actions/auth"
import { useRouter } from "next/navigation"
import { MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Separator } from "@/components/ui/separator"

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

const prefijosPais = [
  { pais: "España", prefijo: "+34", codigo: "ES" },
  { pais: "Francia", prefijo: "+33", codigo: "FR" },
  { pais: "Portugal", prefijo: "+351", codigo: "PT" },
  { pais: "Reino Unido", prefijo: "+44", codigo: "GB" },
  { pais: "Alemania", prefijo: "+49", codigo: "DE" },
  { pais: "Italia", prefijo: "+39", codigo: "IT" },
  { pais: "Países Bajos", prefijo: "+31", codigo: "NL" },
  { pais: "Bélgica", prefijo: "+32", codigo: "BE" },
  { pais: "Suiza", prefijo: "+41", codigo: "CH" },
  { pais: "Austria", prefijo: "+43", codigo: "AT" },
  { pais: "Polonia", prefijo: "+48", codigo: "PL" },
  { pais: "Suecia", prefijo: "+46", codigo: "SE" },
  { pais: "Noruega", prefijo: "+47", codigo: "NO" },
  { pais: "Dinamarca", prefijo: "+45", codigo: "DK" },
  { pais: "Finlandia", prefijo: "+358", codigo: "FI" },
  { pais: "Irlanda", prefijo: "+353", codigo: "IE" },
  { pais: "Grecia", prefijo: "+30", codigo: "GR" },
  { pais: "República Checa", prefijo: "+420", codigo: "CZ" },
  { pais: "Rumanía", prefijo: "+40", codigo: "RO" },
  { pais: "Hungría", prefijo: "+36", codigo: "HU" },
  { pais: "Estados Unidos", prefijo: "+1", codigo: "US" },
  { pais: "Canadá", prefijo: "+1", codigo: "CA" },
  { pais: "México", prefijo: "+52", codigo: "MX" },
  { pais: "Argentina", prefijo: "+54", codigo: "AR" },
  { pais: "Colombia", prefijo: "+57", codigo: "CO" },
  { pais: "Chile", prefijo: "+56", codigo: "CL" },
  { pais: "Perú", prefijo: "+51", codigo: "PE" },
  { pais: "Venezuela", prefijo: "+58", codigo: "VE" },
  { pais: "Brasil", prefijo: "+55", codigo: "BR" },
  { pais: "Uruguay", prefijo: "+598", codigo: "UY" },
]

const formSchema = z
  .object({
    fullName: z.string().min(2, {
      message: "El nombre completo debe tener al menos 2 caracteres.",
    }),
    email: z.string().email({
      message: "Por favor ingresa un correo electrónico válido.",
    }),
    password: z.string().min(8, {
      message: "La contraseña debe tener al menos 8 caracteres.",
    }),
    confirmPassword: z.string(),
    phonePrefix: z.string().optional(),
    phoneNumber: z.string().optional(),
    city: z.string().min(2, {
      message: "Por favor selecciona tu provincia.",
    }),
    termsAccepted: z.boolean().refine((val) => val === true, {
      message: "Debes aceptar los términos y condiciones.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  })

const RegistroForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const router = useRouter()

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true)
    const supabase = createClient()
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message,
        })
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Error al registrarse con Google",
      })
    } finally {
      setIsGoogleLoading(false)
    }
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phonePrefix: "+34",
      phoneNumber: "",
      city: "",
      termsAccepted: false,
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    // Combinar prefijo y número de teléfono
    const fullPhone = values.phonePrefix && values.phoneNumber 
      ? `${values.phonePrefix} ${values.phoneNumber}`
      : undefined

    const result = await registrarCliente({
      email: values.email,
      password: values.password,
      fullName: values.fullName,
      phone: fullPhone,
      city: values.city,
    })

    setIsSubmitting(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "¡Registro Exitoso!",
      description: "Revisa tu correo para verificar tu cuenta.",
    })

    router.push("/auth/registro-exitoso")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de Cliente</CardTitle>
        <CardDescription>Crea tu cuenta para empezar a contratar profesionales</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="María García" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo Electrónico</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="maria.garcia@ejemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Mínimo 8 caracteres" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar Contraseña</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Repite tu contraseña" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Teléfono (Opcional)</FormLabel>
              <div className="flex gap-2">
                <FormField
                  control={form.control}
                  name="phonePrefix"
                  render={({ field }) => (
                    <FormItem className="w-32">
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Prefijo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {prefijosPais.map((p) => (
                            <SelectItem key={p.codigo} value={p.prefijo}>
                              {p.prefijo} {p.pais}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input type="tel" placeholder="600 000 000" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-sm text-muted-foreground">Los profesionales podrán contactarte por teléfono.</p>
            </div>

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Provincia
                  </FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tu provincia" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {provincias.map((prov) => (
                        <SelectItem key={prov.codigo} value={prov.provincia}>
                          {prov.provincia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Te ayudaremos a encontrar profesionales cerca de ti.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="termsAccepted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Términos y Condiciones</FormLabel>
                    <FormDescription>
                      Acepto los{" "}
                      <a href="#" className="text-primary hover:underline">
                        términos de servicio
                      </a>{" "}
                      y la{" "}
                      <a href="#" className="text-primary hover:underline">
                        política de privacidad
                      </a>
                      .
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting || isGoogleLoading}>
              {isSubmitting ? "Creando cuenta..." : "Crear Cuenta"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">O continúa con</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 bg-transparent"
              onClick={handleGoogleSignup}
              disabled={isSubmitting || isGoogleLoading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {isGoogleLoading ? "Conectando..." : "Registrarse con Google"}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Inicia sesión
              </Link>
            </div>

            <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              ¿Eres un profesional?{" "}
              <Link href="/register-freelancer" className="text-primary hover:underline font-medium">
                Regístrate como profesional
              </Link>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default RegistroForm
