# Publicación móvil de Diime

Estado comprobado el 19 de agosto de 2026. La app usa Capacitor 8, carga
`https://www.diime.es` y conserva una pantalla local para errores de conexión.
El identificador configurado en iOS y Android es `es.diime.app`.

> Confirma que `es.diime.app` es el identificador definitivo antes del primer
> upload: después no se puede cambiar sin crear otra app en las tiendas.

## Estado verificable

| Área | Estado | Evidencia |
| --- | --- | --- |
| Web de producción | Build OK | `pnpm build`, 44 rutas generadas; ver deuda técnica abajo |
| Sincronización Capacitor | OK | 8 plugins sincronizados en iOS y Android |
| Android | OK sin firma | API 36, AAB release y `lintRelease` sin errores |
| Android en dispositivo virtual | OK | Instalado y ejecutado en Android 16/API 36 |
| iOS en simulador | Build y ejecución OK | Xcode 26.5, iOS 26.5 e iPhone 17 Pro; lanzamiento inicial solo iPhone |
| iOS para dispositivo | Release validado sin firma | La firma y el Archive requieren el Team del titular |
| Firma de tienda | Pendiente | Requiere las cuentas y claves privadas del titular |

Se han configurado iconos adaptativos/monocromos, splash oscuro, barras del
sistema, zonas seguras, teclado, navegación atrás, compartir, vibración, estado
de red y callback OAuth `es.diime.app://auth/callback`. Android no permite HTTP,
depuración de WebView ni copias de seguridad de datos de la app.

## Bloqueos que necesitan al titular

No son cambios que deban automatizarse con credenciales o claves inventadas:

1. Confirmar `es.diime.app` y crear la app en Apple Developer/App Store Connect y
   Google Play Console con los datos legales del titular.
2. Asignar el Apple Development Team, activar **Sign in with Apple** para el
   identificador y configurarlo también en Supabase.
3. Añadir `es.diime.app://auth/callback` a las Redirect URLs de Supabase y
   desplegar la web con `NEXT_PUBLIC_APPLE_LOGIN=true` cuando Apple esté activo.
4. Crear y guardar fuera del repositorio la clave de subida de Google Play,
   completar `android/key.properties` y activar Play App Signing.
5. Aplicar `supabase/migrations/037_portfolio_contexto_proveedor.sql` y
   `supabase/migrations/038_bloqueo_usuarios.sql` con acceso de
   propietario al proyecto Supabase. El repositorio solo dispone de la clave
   pública, que no puede ni debe ejecutar migraciones.
6. Facilitar dos cuentas de demostración a revisión (cliente y profesional) y
   datos de prueba que permitan recorrer ofertas, chat y un trabajo sin cobrar
   dinero real.
7. Completar las declaraciones de privacidad/Data safety, clasificación por
   edades, DSA/trader status y disponibilidad territorial con información real.
8. Probar registro, Google/Apple, publicación, reporte, mensajería, adjuntos,
   pago/reembolso y borrado de cuenta en un iPhone y un Android reales.

## Compilar Android

El SDK 36, Android Studio, el emulador y OpenJDK 21 ya están instalados en este
Mac. Gradle 8.14 no funciona con el JDK 25 incluido en Android Studio 2026.1, por
lo que hay que usar Java 21:

```bash
cd /Users/juan/Desktop/v0-skill-hub-marketplace
pnpm install --frozen-lockfile
pnpm cap:sync

cd android
JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew bundleRelease lintRelease
```

Sin `android/key.properties` se genera deliberadamente un AAB **sin firma**,
útil para validar el build pero no para subirlo. Copia la plantilla y rellénala
solo después de crear la clave privada:

```bash
/usr/local/opt/openjdk@21/bin/keytool -genkeypair -v \
  -keystore android/diime-upload.jks \
  -alias diime-upload -keyalg RSA -keysize 4096 -validity 10000
cp android/key.properties.example android/key.properties
```

El comando pedirá las contraseñas de forma interactiva. Guarda el `.jks` y sus
contraseñas en dos copias seguras; Git ya ignora ambos archivos privados.

También hay un asistente local que evita poner la contraseña en el historial de
la terminal y no sobrescribe una clave existente:

```bash
./scripts/generar_firma_google_play.sh
```

El AAB queda en
`android/app/build/outputs/bundle/release/app-release.aab` y el informe en
`android/app/build/reports/lint-results-release.html`.

Antes de cada nueva versión incrementa `versionCode` y `versionName` en
`android/app/build.gradle`.

## Compilar iOS

Xcode 26.5 y el runtime iOS 26.5 ya están instalados. Para validar el proyecto
sin una cuenta Apple se ha usado:

```bash
cd /Users/juan/Desktop/v0-skill-hub-marketplace
pnpm cap:sync
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  build
```

El build se instala y arranca correctamente en el simulador iPhone 17 Pro. Para
publicar, abre el proyecto con `pnpm cap:ios`; en Xcode selecciona `App` →
**Signing & Capabilities**, el Team del titular y
el identificador `es.diime.app`. Añade la capacidad **Sign in with Apple**,
comprueba versión `1.0` / build `1`, ejecuta primero en un iPhone y después usa
**Product → Archive → Distribute App → App Store Connect**.

Incrementa `CURRENT_PROJECT_VERSION` en cada upload, aunque se mantenga la
versión comercial. `Info.plist` ya declara que no se usa cifrado no exento y los
paquetes de Capacitor incluyen sus manifiestos de privacidad. La app incorpora
además `PrivacyInfo.xcprivacy`, declara el uso de cámara/fototeca y el primer
lanzamiento queda limitado a iPhone porque la interfaz aún no está optimizada
para iPad.

## Revisión de las tiendas

- Diime intermedia servicios entre personas que se realizan fuera de la app.
  Stripe no vende contenido digital ni desbloquea funciones; explícalo así en
  las notas de revisión y responde de forma coherente en Google Play.
- El borrado de cuenta está dentro de **Mi cuenta → Eliminar mi cuenta** y en
  `https://www.diime.es/eliminar-cuenta`, incluso para quien ya no pueda iniciar
  sesión.
- Los usuarios pueden reportar problemas generales sin haber contratado un
  trabajo; el panel de administración permite gestionarlos.
- El registro exige aceptar Términos, Privacidad y Normas de la comunidad. Se
  han añadido filtro preventivo, reporte y bloqueo desde perfiles y
  conversaciones; falta aplicar la migración indicada y verificar el SLA
  operativo de moderación.
- No envíes la versión iOS mientras Google aparezca como login y Apple siga
  oculto: Apple suele exigir una opción equivalente de Sign in with Apple.
- El build web actual omite la validación de tipos y el repositorio conserva
  errores TypeScript previos, principalmente por clientes Supabase anulables;
  `pnpm lint` tampoco tiene aún ESLint instalado. No impiden generar el wrapper,
  pero deben entrar en la siguiente ronda de saneamiento del producto.

Los textos, la propuesta de declaraciones y las notas para revisión están en
[`STORE_LISTING_ES.md`](./STORE_LISTING_ES.md).

Los primeros recursos de ficha están en `store-assets/`: icono e imagen
destacada de Google Play y previsualizaciones de portada para Android e iPhone.
El set final debe regenerarse después de desplegar la web; las capturas
autenticadas requieren las cuentas de demostración.

## Enlaces oficiales de control

- [Entorno de Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Envío a App Store](https://developer.apple.com/app-store/submitting/)
- [Guía de revisión de App Store](https://developer.apple.com/app-store/review/guidelines/)
- [Requisito de API objetivo de Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=es-419)
