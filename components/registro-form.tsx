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
import { toast } from "@/hooks/use-toast"
import Link from "next/link"
import { registrarCliente } from "@/app/actions/auth"
import { useRouter } from "next/navigation"

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
                  <FormLabel>Ciudad</FormLabel>
                  <FormControl>
                    <Input placeholder="Madrid" {...field} />
                  </FormControl>
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
