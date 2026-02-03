"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Star, MapPin, Briefcase, Clock, Phone, Mail, MessageCircle } from "lucide-react"
import type { ProfessionalProfile } from "@/lib/profiles-data"

export default function ProfileHeader({ profile }: { profile: ProfessionalProfile }) {
  return (
    <div className="relative">
      {/* Cover Image */}
      <div className="h-64 md:h-80 overflow-hidden">
        <img src={profile.coverImage || "/placeholder.svg"} alt="Cover" className="w-full h-full object-cover" />
      </div>

      {/* Profile Info */}
      <div className="container mx-auto px-4">
        <Card className="relative -mt-20 md:-mt-24 p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-background">
              <AvatarImage src={profile.avatar || "/placeholder.svg"} />
              <AvatarFallback className="text-4xl">{profile.name.charAt(0)}</AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold mb-2">{profile.name}</h1>
                  <p className="text-xl text-muted-foreground mb-3">{profile.title}</p>

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.location}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Briefcase className="h-4 w-4" />
                      <span>{profile.completedProjects} proyectos completados</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>Responde en {profile.responseTime}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1">
                      <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                      <span className="font-bold text-lg">{profile.rating}</span>
                      <span className="text-muted-foreground">({profile.totalReviews} valoraciones)</span>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                      {profile.level}
                    </Badge>
                    <Badge variant={profile.availability === "Disponible" ? "default" : "secondary"}>
                      {profile.availability}
                    </Badge>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 md:min-w-[200px]">
                  <Button size="lg" className="w-full">
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Enviar Mensaje
                  </Button>
                  <Button size="lg" variant="outline" className="w-full bg-transparent">
                    <Phone className="h-4 w-4 mr-2" />
                    Contactar
                  </Button>
                </div>
              </div>

              {/* Contact Info */}
              <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.email}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
