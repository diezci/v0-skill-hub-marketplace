"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, CheckCircle, Award } from "lucide-react"
import Link from "next/link"

const ComingSoonTest = () => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  const [isAvailable, setIsAvailable] = useState(true)

  useEffect(() => {
    if (!isAvailable) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev.days === 0 && prev.hours === 0 && prev.minutes === 0 && prev.seconds === 0) {
            clearInterval(timer)
            setIsAvailable(true)
            return prev
          }

          let newSeconds = prev.seconds - 1
          let newMinutes = prev.minutes
          let newHours = prev.hours
          let newDays = prev.days

          if (newSeconds < 0) {
            newSeconds = 59
            newMinutes -= 1
          }

          if (newMinutes < 0) {
            newMinutes = 59
            newHours -= 1
          }

          if (newHours < 0) {
            newHours = 23
            newDays -= 1
          }

          return {
            days: newDays,
            hours: newHours,
            minutes: newMinutes,
            seconds: newSeconds,
          }
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [isAvailable])

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-background">
      <CardHeader className="pb-4">
        {isAvailable ? (
          <Badge className="w-fit mb-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Disponible Ahora
          </Badge>
        ) : (
          <Badge className="w-fit mb-2">Próximamente</Badge>
        )}
        <CardTitle className="text-xl">Verificación de Habilidades Profesionales</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <p className="text-muted-foreground">
            Para garantizar que solo profesionales cualificados estén en nuestra plataforma, requerimos que todos los
            profesionales pasen una prueba de verificación de habilidades en su campo elegido.
          </p>

          {!isAvailable ? (
            <div className="bg-background rounded-lg p-4 shadow-sm">
              <h3 className="font-semibold mb-2 flex items-center">
                <Clock className="h-4 w-4 mr-2 text-primary" />
                Lanzamiento en:
              </h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-muted rounded-md p-2">
                  <div className="text-2xl font-bold">{timeLeft.days}</div>
                  <div className="text-xs text-muted-foreground">Días</div>
                </div>
                <div className="bg-muted rounded-md p-2">
                  <div className="text-2xl font-bold">{timeLeft.hours}</div>
                  <div className="text-xs text-muted-foreground">Horas</div>
                </div>
                <div className="bg-muted rounded-md p-2">
                  <div className="text-2xl font-bold">{timeLeft.minutes}</div>
                  <div className="text-xs text-muted-foreground">Minutos</div>
                </div>
                <div className="bg-muted rounded-md p-2">
                  <div className="text-2xl font-bold">{timeLeft.seconds}</div>
                  <div className="text-xs text-muted-foreground">Segundos</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-md">
              <h3 className="font-semibold text-green-800 dark:text-green-400 flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Pruebas de Verificación Disponibles
              </h3>
              <p className="text-green-700 dark:text-green-300 mt-2">
                Realiza una prueba de verificación de habilidades en tu campo para obtener una insignia verificada y
                aumentar tu visibilidad ante los clientes.
              </p>
              <div className="mt-4">
                <img
                  src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=600&q=80"
                  alt="Verificación de habilidades"
                  className="w-full h-auto rounded-md mb-4"
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-semibold">Qué esperar:</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500 shrink-0 mt-0.5" />
                <span>Pruebas específicas para cada categoría (Electricidad, Fontanería, Carpintería, etc.)</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500 shrink-0 mt-0.5" />
                <span>Evaluaciones prácticas que miden tus habilidades del mundo real</span>
              </li>
              <li className="flex items-start">
                <CheckCircle className="h-5 w-5 mr-2 text-green-500 shrink-0 mt-0.5" />
                <span>Insignia verificada en tu perfil al completar exitosamente</span>
              </li>
            </ul>
          </div>

          <div className="bg-primary/5 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Award className="h-5 w-5 mr-2 text-primary" />
              <h3 className="font-semibold">Beneficios de la Verificación</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Los profesionales verificados reciben prioridad en los resultados de búsqueda, mayor visibilidad ante los
              clientes y acceso a proyectos exclusivos mejor remunerados.
            </p>
          </div>

          {isAvailable ? (
            <Button className="w-full" asChild>
              <Link href="/skill-verification">Realizar Prueba de Verificación</Link>
            </Button>
          ) : (
            <Button className="w-full" disabled>
              Notificarme Cuando Esté Disponible
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default ComingSoonTest
