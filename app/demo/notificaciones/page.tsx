import { notFound } from "next/navigation"
import { DemoNotificaciones } from "@/components/demo-notificaciones"

export const metadata = {
  title: "Ejemplos de notificaciones | Diime",
  robots: { index: false, follow: false },
}

export default async function DemoNotificacionesPage({ searchParams }: {
  searchParams: Promise<{ ejemplo?: string }>
}) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { ejemplo } = await searchParams
  return <DemoNotificaciones ejemploInicial={ejemplo} />
}
