import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function StripeConnectRefreshPage() {
  return (
    <main className="container mx-auto max-w-xl px-4 pb-16 pt-28">
      <Card>
        <CardHeader><CardTitle>El enlace de Stripe ha caducado</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Los enlaces de alta son de un solo uso. Genera uno nuevo desde tu perfil para continuar exactamente donde lo dejaste.</p>
          <Button asChild><Link href="/mi-perfil">Volver y continuar</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}

