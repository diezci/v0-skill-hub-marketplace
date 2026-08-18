# Diime para iOS y Android

La aplicación nativa usa Capacitor 8 y el identificador provisional `es.diime.app` en ambas plataformas.

## Estado actual

- Proyectos nativos creados en `ios/` y `android/`.
- Android configurado para API 36, sin tráfico HTTP ni copias de seguridad de datos sensibles.
- iOS configurado con Swift Package Manager y el esquema profundo `es.diime.app://`.
- Navegación inferior, zonas seguras, teclado, barras del sistema, compartir, vibración, red y pantalla de arranque integrados.
- Inicio de sesión social preparado para volver a la app mediante `es.diime.app://auth/callback`.
- Iconos y pantallas de arranque generados desde el logotipo original de Diime.

## Configuración pendiente antes de compilar para las tiendas

1. Instalar Xcode 26 o posterior y Android Studio 2025.2.1 o posterior.
2. Añadir `es.diime.app://auth/callback` a las Redirect URLs permitidas en Supabase Authentication.
3. Activar Sign in with Apple en Apple Developer y Supabase, y después cambiar `NEXT_PUBLIC_APPLE_LOGIN=true` en producción.
4. Crear los certificados/perfiles de firma de Apple y la clave de firma de Android. Las claves privadas nunca deben subirse al repositorio.
5. Probar los recorridos de registro, login, publicación, mensajería, archivos y pago en dispositivos reales.

## Comandos habituales

```bash
npm run cap:sync
npm run cap:android
npm run cap:ios
npm run cap:doctor
npm run cap:assets
```

Para previsualizar la navegación nativa en el servidor local sin un simulador:

```text
http://localhost:3000/?native-preview=1
```

## Publicación

El pago de las cuentas de desarrollador, la creación definitiva de las fichas y el envío a revisión quedan expresamente fuera de esta fase. Antes de esos pasos hay que confirmar el identificador final, los datos legales del titular y el contenido de las fichas.
