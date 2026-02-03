import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Award, Languages } from "lucide-react"
import type { ProfessionalProfile } from "@/lib/profiles-data"

export default function ProfileSkills({ profile }: { profile: ProfessionalProfile }) {
  return (
    <div className="space-y-6">
      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Habilidades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill, index) => (
              <Badge key={index} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Certifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Certificaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {profile.certifications.map((cert, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-sm">{cert}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Idiomas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile.languages.map((language, index) => (
              <Badge key={index} variant="outline">
                {language}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
