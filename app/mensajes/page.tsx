import { Suspense } from "react"
import MensajesContent from "@/components/mensajes-content"
import { Loader2 } from "lucide-react"

export const metadata = {
  title: "Mensajes | SkillHub",
  description: "Gestiona tus conversaciones con clientes y profesionales",
}

export default function MensajesPage() {
  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <MensajesContent />
      </Suspense>
    </div>
  )
}
