"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Cookie } from "lucide-react"
import { useT } from "@/components/idioma-provider"

export const COOKIES_KEY = "diime_cookies_consentimiento"
// Se avisa por evento para que la bienvenida no se solape con el banner: lo
// primero que hay que poder contestar es el consentimiento.
export const COOKIES_EVENTO = "diime:cookies-decididas"

export type ConsentimientoCookies = "aceptadas" | "rechazadas"

// El banner también se prepara con el HTML: una primera visita no tiene que
// esperar a React para decidir cookies y ver inmediatamente la bienvenida.
const INICIAR_COOKIES = `(() => {
  const banner = document.getElementById('diime-cookies');
  if (!banner || banner.dataset.ready) return;
  banner.dataset.ready = 'true';
  const decidir = (valor) => {
    try { localStorage.setItem('${COOKIES_KEY}', valor); } catch {}
    banner.hidden = true;
    window.dispatchEvent(new CustomEvent('${COOKIES_EVENTO}'));
  };
  if (navigator.userAgent.includes('DiimeNative/')) { decidir('rechazadas'); return; }
  try {
    const valor = localStorage.getItem('${COOKIES_KEY}');
    if (valor === 'aceptadas' || valor === 'rechazadas') return;
  } catch {}
  banner.addEventListener('click', (event) => {
    const valor = event.target.closest('[data-cookie-decision]')?.dataset.cookieDecision;
    if (valor === 'aceptadas' || valor === 'rechazadas') decidir(valor);
  });
  banner.hidden = false;
})()`

// Qué decidió esta persona. `null` = todavía no ha contestado.
// Pensado para que, cuando se añada analítica, se pueda consultar antes de
// cargarla: sin un "aceptadas" explícito no debe cargarse nada opcional.
export function consentimientoCookies(): ConsentimientoCookies | null {
  if (typeof window === "undefined") return null
  try {
    const v = localStorage.getItem(COOKIES_KEY)
    return v === "aceptadas" || v === "rechazadas" ? v : null
  } catch {
    return null
  }
}

export function BannerCookies() {
  const t = useT()
  const scriptRef = useRef<HTMLScriptElement>(null)

  useEffect(() => {
    const script = document.createElement("script")
    script.textContent = INICIAR_COOKIES
    scriptRef.current?.after(script)
    script.remove()
  }, [])

  return (
    <>
      <div
        id="diime-cookies"
        hidden
        suppressHydrationWarning
        role="dialog"
        aria-label={t("Consentimiento de cookies")}
        className="fixed inset-x-0 bottom-0 z-[100] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="container mx-auto max-w-4xl px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Cookie className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 hidden sm:block" />
          <p className="text-sm text-muted-foreground flex-1">
            {t("cookies.texto")}{" "}
            <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
              {t("cookies.masInfo")}
            </Link>
            .
          </p>
          {/* Los dos botones con el mismo peso visual: el RGPD exige que rechazar
              sea tan fácil como aceptar. */}
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none bg-transparent" data-cookie-decision="rechazadas">
              {t("cookies.soloNecesarias")}
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
              data-cookie-decision="aceptadas"
            >
              {t("cookies.aceptarTodas")}
            </Button>
          </div>
        </div>
      </div>
      <script ref={scriptRef} dangerouslySetInnerHTML={{ __html: INICIAR_COOKIES }} />
    </>
  )
}
