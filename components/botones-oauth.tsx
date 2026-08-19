"use client"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { Capacitor } from "@capacitor/core"
import { Browser } from "@capacitor/browser"

// Botones de "entrar con…" compartidos por /auth/login y /auth/registro, que
// antes tenían cada uno su copia del de Google.
//
// El de Apple no es un capricho: la guía 4.8 de la App Store obliga a ofrecer
// Sign in with Apple en cuanto se ofrece otro login social (Google, en nuestro
// caso), así que sin él no se puede publicar la app.
//
// Apple Developer y Supabase ya están configurados en producción, así que el
// botón queda activo por defecto. La variable permite apagarlo explícitamente
// solo como medida de emergencia sin volver a modificar este componente.
export const APPLE_LOGIN_ACTIVO = process.env.NEXT_PUBLIC_APPLE_LOGIN !== "false"

function IconoGoogle() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function IconoApple() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

export function BotonesOAuth({
  cargando,
  onCargando,
  onError,
  aceptaTerminos = true,
  confirmaMayoriaEdad = true,
}: {
  cargando: boolean
  onCargando: (v: boolean) => void
  onError: (mensaje: string) => void
  aceptaTerminos?: boolean
  confirmaMayoriaEdad?: boolean
}) {
  const entrarCon = async (proveedor: "google" | "apple") => {
    if (!aceptaTerminos) {
      onError("Acepta los Términos y las Normas de la comunidad para crear una cuenta.")
      return
    }
    if (!confirmaMayoriaEdad) {
      onError("Confirma que tienes 18 años o más para crear una cuenta.")
      return
    }
    const supabase = createClient()
    onCargando(true)
    onError("")

    try {
      const esAppNativa = Capacitor.isNativePlatform()
      const callbackWeb = new URL("/auth/callback", window.location.origin)
      const callbackNativo = new URL("es.diime.app://auth/callback")
      const requested = new URLSearchParams(window.location.search).get("next")
      if (requested?.startsWith("/") && !requested.startsWith("//")) callbackWeb.searchParams.set("next", requested)
      if (window.location.pathname === "/auth/registro") {
        callbackWeb.searchParams.set("terms", "1")
        callbackWeb.searchParams.set("age", "1")
        callbackNativo.searchParams.set("terms", "1")
        callbackNativo.searchParams.set("age", "1")
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: proveedor,
        options: {
          redirectTo: esAppNativa ? callbackNativo.toString() : callbackWeb.toString(),
          skipBrowserRedirect: esAppNativa,
          // Solo Google admite estos parámetros; a Apple no se le mandan.
          ...(proveedor === "google"
            ? { queryParams: { access_type: "offline", prompt: "consent" } }
            : {}),
        },
      })
      if (error) throw error
      if (esAppNativa && data.url) {
        await Browser.open({ url: data.url, presentationStyle: "popover" })
      }
      // Si no hay error el navegador se va al proveedor: no se quita el
      // "cargando" a propósito, para que no se pueda pulsar dos veces.
    } catch (e: unknown) {
      const nombre = proveedor === "google" ? "Google" : "Apple"
      onError(e instanceof Error ? e.message : `Error al continuar con ${nombre}`)
      onCargando(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 bg-transparent"
        onClick={() => entrarCon("google")}
        disabled={cargando || !aceptaTerminos || !confirmaMayoriaEdad}
      >
        <IconoGoogle />
        Continuar con Google
      </Button>

      {/* Apple pide que su botón tenga al menos la misma presencia que los
          demás, de ahí el mismo tamaño y la misma posición que el de Google. */}
      {APPLE_LOGIN_ACTIVO && (
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 bg-transparent"
          onClick={() => entrarCon("apple")}
          disabled={cargando || !aceptaTerminos || !confirmaMayoriaEdad}
        >
          <IconoApple />
          Continuar con Apple
        </Button>
      )}
    </div>
  )
}
