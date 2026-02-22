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
    phone: z.string().optional(),
    city: z.string().min(2, {
      message: "Por favor ingresa tu ciudad.",
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
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phone: "",
      city: "",
      termsAccepted: false,
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    const result = await registrarCliente({
      email: values.email,
      password: values.password,
      fullName: values.fullName,
      phone: values.phone,
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

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono (Opcional)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+34 600 000 000" {...field} />
                  </FormControl>
                  <FormDescription>Los profesionales podrán contactarte por teléfono.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creando cuenta..." : "Crear Cuenta"}
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
