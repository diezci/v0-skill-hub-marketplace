import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProfessionalProfile } from "@/lib/profiles-data"

export default function ProfileAbout({ profile }: { profile: ProfessionalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sobre mí</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-relaxed">{profile.bio}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t">
          <div>
            <p className="text-2xl font-bold text-primary">{profile.yearsExperience}</p>
            <p className="text-sm text-muted-foreground">Años de experiencia</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{profile.completedProjects}</p>
            <p className="text-sm text-muted-foreground">Proyectos completados</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{profile.rating}</p>
            <p className="text-sm text-muted-foreground">Valoración media</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">€{profile.hourlyRate}/h</p>
            <p className="text-sm text-muted-foreground">Tarifa por hora</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
