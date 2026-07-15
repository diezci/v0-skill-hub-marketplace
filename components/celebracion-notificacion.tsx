"use client"

// Overlay festivo para los dos hitos más gratificantes de la plataforma:
// - el cliente recibe la entrega de un trabajo ("trabajo_entregado")
// - el profesional cobra un trabajo ("pago_liberado")
// Se muestra una sola vez por notificación (el navbar guarda las ya celebradas
// en localStorage) e intenta reproducir un arpegio breve con Web Audio; si el
// navegador bloquea el audio por falta de gesto del usuario, falla en silencio.

import { useEffect, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PartyPopper, X } from "lucide-react"

interface Props {
  notificacion: { id: string; tipo: string; titulo?: string; mensaje?: string; link?: string }
  onClose: () => void
}

function reproducirArpegio(tipo: "pago" | "entrega") {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    // Do-Mi-Sol (y Do agudo extra cuando hay dinero de por medio).
    const notas = tipo === "pago" ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99]
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.6)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch {
    // sin sonido: la celebración visual basta
  }
}

const COLORES_CONFETI = ["#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6", "#facc15"]

// Variante visual/sonora según el tipo de notificación celebrada.
const VARIANTES: Record<
  string,
  { emoji: string; etiqueta: string; titulo: string; cta: string; sonido: "pago" | "entrega" }
> = {
  pago_liberado: {
    emoji: "💶",
    etiqueta: "¡Pago liberado!",
    titulo: "Has cobrado un trabajo",
    cta: "Ver mis cobros",
    sonido: "pago",
  },
  pago_recibido: {
    emoji: "🚀",
    etiqueta: "¡Cobro protegido, a por ello!",
    titulo: "El cliente ha pagado: ya puedes empezar",
    cta: "Ver el trabajo",
    sonido: "pago",
  },
  trabajo_entregado: {
    emoji: "📦",
    etiqueta: "¡Trabajo entregado!",
    titulo: "Tienes una entrega lista",
    cta: "Revisar la entrega",
    sonido: "entrega",
  },
}

export function CelebracionNotificacion({ notificacion, onClose }: Props) {
  const variante = VARIANTES[notificacion.tipo] || VARIANTES.trabajo_entregado

  // Piezas de confeti con posiciones/tiempos aleatorios pero estables por render.
  const confeti = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        color: COLORES_CONFETI[i % COLORES_CONFETI.length],
        size: 6 + Math.random() * 6,
        tilt: Math.random() * 360,
      })),
    [notificacion.id],
  )

  useEffect(() => {
    reproducirArpegio(variante.sonido)
  }, [notificacion.id, variante.sonido])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <style>{`
        @keyframes diime-confeti-caida {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.6; }
        }
        @keyframes diime-celebracion-pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.06); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes diime-emoji-salto {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50% { transform: translateY(-10px) rotate(4deg); }
        }
      `}</style>

      {/* Confeti */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {confeti.map((p, i) => (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.45,
              backgroundColor: p.color,
              transform: `rotate(${p.tilt}deg)`,
              animation: `diime-confeti-caida ${p.duration}s linear ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <div
        className="relative w-full max-w-md rounded-2xl border border-emerald-500/30 bg-background shadow-2xl p-8 text-center"
        style={{ animation: "diime-celebracion-pop 0.45s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="text-6xl mb-4 select-none"
          style={{ animation: "diime-emoji-salto 1.2s ease-in-out infinite" }}
          aria-hidden="true"
        >
          {variante.emoji}
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-wide mb-3">
          <PartyPopper className="h-3.5 w-3.5" />
          {variante.etiqueta}
        </div>

        <h2 className="text-2xl font-bold mb-2 text-balance">{notificacion.titulo || variante.titulo}</h2>
        {notificacion.mensaje && (
          <p className="text-sm text-muted-foreground mb-6 text-pretty">{notificacion.mensaje}</p>
        )}

        <div className="flex gap-2 justify-center">
          <Button variant="outline" className="bg-transparent" onClick={onClose}>
            Cerrar
          </Button>
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <Link href={notificacion.link || "/"} onClick={onClose}>
              {variante.cta}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
