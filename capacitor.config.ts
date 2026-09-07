/// <reference types="@capawesome/capacitor-badge" />

import type { CapacitorConfig } from "@capacitor/cli"
import { KeyboardResize } from "@capacitor/keyboard"

// Diime depende de Next.js, Server Actions, Supabase y Stripe, por lo que no
// puede exportarse como un paquete estático. El contenedor nativo carga el
// dominio HTTPS de producción y conserva una pantalla local para los errores
// de conexión. CAPACITOR_APP_URL permite apuntar una build interna a staging.
const appUrl = process.env.CAPACITOR_APP_URL?.trim() || "https://www.diime.es"

const config: CapacitorConfig = {
  appId: "es.diime.app",
  appName: "Diime",
  webDir: "native-shell",
  appendUserAgent: " DiimeNative/1.0",
  backgroundColor: "#080c10",
  loggingBehavior: process.env.CAPACITOR_DEBUG === "true" ? "debug" : "none",
  zoomEnabled: false,
  server: {
    url: appUrl,
    cleartext: false,
    allowNavigation: ["www.diime.es", "diime.es"],
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    minWebViewVersion: 110,
    resolveServiceWorkerRequests: false,
    // Solo para diagnosticar una compilación interna conectada por USB.
    // Las builds de tienda mantienen la inspección desactivada por defecto.
    webContentsDebuggingEnabled: process.env.CAPACITOR_DEBUG === "true",
  },
  ios: {
    allowsLinkPreview: false,
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Badge: {
      persist: false,
      autoClear: false,
    },
    App: {
      disableBackButtonHandler: true,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
    SplashScreen: {
      // La web lo oculta en cuanto está lista. Este máximo evita un logo
      // permanente si falla la conexión o no llega a hidratarse React.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: "#080c10",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#080c10",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
}

export default config
