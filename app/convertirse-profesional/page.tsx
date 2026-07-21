"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { crearPerfilProfesional } from "@/app/actions/auth"
import { toast } from "@/hooks/use-toast"

export default function ConvertirseEnProfesionalPage() {
  const [titulo, setTitulo] = useState("")
  const [habilidades, setHabilidades] = useState("")
  const [tarifaHora, setTarifaHora] = useState("")
  const [anosExperiencia, setAnosExperiencia] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const habilidadesArray = habilidades
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)

    const result = await crearPerfilProfesional({
      titulo,
      habilidades: habilidadesArray,
      tarifaHora: tarifaHora ? Number.parseFloat(tarifaHora) : undefined,
      anosExperiencia: anosExperiencia ? Number.parseInt(anosExperiencia) : undefined,
    })

    setIsLoading(false)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
      return
    }

    toast({
      title: "¡Perfil Profesional Creado!",
      description: "Ahora puedes empezar a ofrecer tus servicios",
    })

    router.push("/mi-cuenta")
  }

  return (
    <div className="container max-w-2xl py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Conviértete en Profesional</CardTitle>
          <CardDescription>
            Completa tu perfil profesional para empezar a ofrecer servicios en la plataforma
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título Profesional</Label>
              <Input
                id="titulo"
                placeholder="ej: Electricista Certificado"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">Un título descriptivo de tu profesión o especialidad</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="habilidades">Habilidades</Label>
              <Input
                id="habilidades"
                placeholder="Instalaciones eléctricas, Domótica, Iluminación LED"
                value={habilidades}
                onChange={(e) => setHabilidades(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">Separa tus habilidades con comas</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tarifa">Tarifa por Hora (€)</Label>
                <Input
                  id="tarifa"
                  type="number"
                  step="0.01"
                  placeholder="25.00"
                  value={tarifaHora}
                  onChange={(e) => setTarifaHora(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="experiencia">Años de Experiencia</Label>
                <Input
                  id="experiencia"
                  type="number"
                  placeholder="5"
                  value={anosExperiencia}
                  onChange={(e) => setAnosExperiencia(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-2">💡 Después de crear tu perfil podrás:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Ver y responder a solicitudes de servicios</li>
                <li>• Enviar ofertas personalizadas a clientes</li>
                <li>• Construir tu portfolio con proyectos completados</li>
                <li>• Recibir valoraciones y reseñas</li>
              </ul>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creando perfil..." : "Crear Perfil Profesional"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
