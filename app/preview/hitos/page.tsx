import { notFound } from "next/navigation"
import { PreviewHitos } from "@/components/hitos/preview-hitos"

export default function HitosPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <PreviewHitos />
}
