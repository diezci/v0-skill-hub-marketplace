"use client"

import { useT } from "@/components/idioma-provider"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, Clock, MapPin, Calendar, Globe } from "lucide-react"
import type { ProfessionalProfile } from "@/lib/profiles-data"
import { useChatWidget } from "@/components/chat-widget"

export default function ProfileSidebar({ profile }: { profile: ProfessionalProfile }) {
  const t = useT()
  const { openChat } = useChatWidget()

  const handleContact = () => {
    openChat(profile.id.toString(), profile.name)
  }

  return (
    <div className="space-y-6">
      {/* Contact Card */}
      <Card>
        <CardContent className="pt-6">
          <Button className="w-full" size="lg" onClick={handleContact}>
            <MessageCircle className="mr-2 h-5 w-5" />
            {t("Contactar")}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("Información Rápida")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t("Tiempo de respuesta")}</p>
              <p className="text-sm text-muted-foreground">{t(profile.responseTime)}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t("Ubicación")}</p>
              <p className="text-sm text-muted-foreground">{profile.location}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t("Miembro desde")}</p>
              <p className="text-sm text-muted-foreground">{profile.memberSince}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">{t("Idiomas")}</p>
              <p className="text-sm text-muted-foreground">{profile.languages.join(", ")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skills Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("Habilidades")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Certifications Card */}
      {profile.certifications && profile.certifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("Certificaciones")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {profile.certifications.map((cert, index) => (
                <li key={index} className="text-sm">
                  {cert}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
