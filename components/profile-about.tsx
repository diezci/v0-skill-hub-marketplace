"use client"

import { useT, useIdioma } from "@/components/idioma-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatearPrecioEuros } from "@/lib/utils"
import type { ProfessionalProfile } from "@/lib/profiles-data"

export default function ProfileAbout({ profile }: { profile: ProfessionalProfile }) {
  const t = useT()
  const { idioma } = useIdioma()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Sobre mí")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-relaxed">{profile.bio}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div>
            <p className="text-2xl font-bold text-primary">{profile.yearsExperience}</p>
            <p className="text-sm text-muted-foreground">{t("Años de experiencia")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{profile.completedProjects}</p>
            <p className="text-sm text-muted-foreground">{t("Proyectos completados")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{profile.rating}</p>
            <p className="text-sm text-muted-foreground">{t("Valoración media")}</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{formatearPrecioEuros(profile.hourlyRate, idioma)}/h</p>
            <p className="text-sm text-muted-foreground">{t("Tarifa por hora")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
