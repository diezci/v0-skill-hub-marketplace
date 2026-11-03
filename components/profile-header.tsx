import type { ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"

/** Shared cover and identity layout for personal and company profiles. */
export function ProfileHeader({ coverUrl, coverAlt, coverActions, avatar, avatarActions, children }: {
  coverUrl?: string
  coverAlt: string
  coverActions?: ReactNode
  avatar: ReactNode
  avatarActions?: ReactNode
  children: ReactNode
}) {
  return <div className="relative">
    <div className="h-48 md:h-64 rounded-xl overflow-hidden bg-gradient-to-r from-primary/20 to-primary/5">
      <img src={coverUrl || "/placeholder.svg"} alt={coverAlt} className="w-full h-full object-cover" />
      {coverActions}
    </div>
    <Card className="relative mx-4 md:mx-8 -mt-16 md:-mt-20 border-border/50 bg-card/95 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="relative w-fit shrink-0 self-start">
            {avatar}
            {avatarActions}
          </div>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      </CardContent>
    </Card>
  </div>
}

export function ProfileHeaderAvatar({ src, alt, fallback }: { src?: string; alt?: string; fallback: ReactNode }) {
  return <Avatar className="h-28 w-28 md:h-36 md:w-36 border-4 border-background shadow-xl">
    <AvatarImage src={src || "/placeholder.svg"} alt={alt} />
    <AvatarFallback className="text-3xl">{fallback}</AvatarFallback>
  </Avatar>
}
