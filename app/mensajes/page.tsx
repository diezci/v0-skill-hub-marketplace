import { Suspense } from "react"
import MensajesContent from "@/components/mensajes-content"
import { Loader2 } from "lucide-react"

export const metadata = {
  title: "Mensajes | Diime",
  description: "Gestiona tus conversaciones con clientes y profesionales",
}

export default function MensajesPage() {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden overscroll-none">
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
