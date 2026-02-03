"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { registrarProfesional } from "@/app/actions/auth"
import { useRouter } from "next/navigation"

const formSchema = z.object({
  fullName: z.string().min(2, {
    message: "El nombre completo debe tener al menos 2 caracteres.",
  }),
  email: z.string().email({
    message: "Por favor ingresa un correo electrónico válido.",
  }),
  password: z.string().min(8, {
    message: "La contraseña debe tener al menos 8 caracteres.",
  }),
  category: z.string({
    required_error: "Por favor selecciona una categoría principal.",
  }),
  skills: z.string().min(3, {
    message: "Por favor ingresa al menos una habilidad.",
  }),
  bio: z.string().min(20, {
    message: "La biografía debe tener al menos 20 caracteres.",
  }),
  hourlyRate: z.string().min(1, {
    message: "Por favor ingresa tu tarifa por hora.",
  }),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: "Debes aceptar los términos y condiciones.",
  }),
})

const FreelancerRegistration = () => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      skills: "",
      bio: "",
      hourlyRate: "",
      termsAccepted: false,
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)

    const result = await registrarProfesional({
      email: values.email,
      password: values.password,
      fullName: values.fullName,
      category: values.category,
      skills: values.skills,
      bio: values.bio,
      hourlyRate: values.hourlyRate,
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
      title: "Registro Enviado",
      description: "Revisa tu correo para verificar tu cuenta y completar tu perfil.",
    })

    router.push("/auth/registro-exitoso")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de Profesional</CardTitle>
        <CardDescription>Crea tu perfil profesional para mostrar tus habilidades y experiencia.</CardDescription>
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
                    <Input placeholder="Juan Pérez" {...field} />
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
                    <Input type="email" placeholder="juan.perez@ejemplo.com" {...field} />
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
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría Principal</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="arquitecto">Arquitecto</SelectItem>
                      <SelectItem value="disenador-interiores">Diseñador de Interiores</SelectItem>
                      <SelectItem value="contratista">Contratista / Jefe de Obra</SelectItem>
                      <SelectItem value="albanil">Albañil</SelectItem>
                      <SelectItem value="carpintero">Carpintero</SelectItem>
                      <SelectItem value="fontanero">Fontanero</SelectItem>
                      <SelectItem value="electricista">Electricista</SelectItem>
                      <SelectItem value="pintor">Pintor</SelectItem>
                      <SelectItem value="yesero">Yesero / Pladurista</SelectItem>
                      <SelectItem value="instalador-suelos">Instalador de Suelos</SelectItem>
                      <SelectItem value="climatizacion">Técnico en Climatización</SelectItem>
                      <SelectItem value="cerrajero">Cerrajero</SelectItem>
                      <SelectItem value="marmolista">Marmolista</SelectItem>
                      <SelectItem value="instalador-ventanas">Instalador de Ventanas</SelectItem>
                      <SelectItem value="ebanista">Ebanista</SelectItem>
                      <SelectItem value="tapicero">Tapicero</SelectItem>
                      <SelectItem value="jardinero">Jardinero</SelectItem>
                      <SelectItem value="domotica">Especialista en Domótica</SelectItem>
                      <SelectItem value="impermeabilizaciones">Instalador de Impermeabilizaciones</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Elige la categoría que mejor representa tu experiencia.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="skills"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Habilidades</FormLabel>
                  <FormControl>
                    <Input placeholder="ej: Instalación eléctrica, Certificaciones, Reparaciones" {...field} />
                  </FormControl>
                  <FormDescription>Ingresa habilidades separadas por comas.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biografía Profesional</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Cuéntale a los clientes sobre tu experiencia, habilidades y especialización..."
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Escribe una biografía convincente que destaque tu experiencia y especialización.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hourlyRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tarifa por Hora (€)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="ej: 35" {...field} />
                  </FormControl>
                  <FormDescription>Ingresa tu tarifa por hora en euros.</FormDescription>
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
              {isSubmitting ? "Enviando..." : "Registrarse como Profesional"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default FreelancerRegistration
