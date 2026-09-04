# Publicación móvil de Diime

Estado del repositorio comprobado el 4 de septiembre de 2026; el estado de las
consolas se comprobó por última vez el 19 de agosto de 2026. La app usa Capacitor 8, carga
`https://www.diime.es` y conserva una pantalla local para errores de conexión.
El identificador configurado en iOS y Android es `es.diime.app`.

> Confirma que `es.diime.app` es el identificador definitivo antes del primer
> upload: después no se puede cambiar sin crear otra app en las tiendas.

## Estado verificable

| Área | Estado | Evidencia |
| --- | --- | --- |
| Web del repositorio | Build OK | `pnpm build`, 50 rutas generadas; ver deuda técnica abajo |
| Supabase de producción | Alertas operativas aplicadas | Tabla, RLS y función de registro operativo creadas el 4 de septiembre de 2026; verificar además las migraciones funcionales 045–049 |
| Sincronización Capacitor | OK | 8 plugins sincronizados en iOS y Android |
| Android | AAB firmado | API 36, bundle release firmado y certificado verificado con `jarsigner` |
| Android en dispositivo virtual | OK | Instalado y ejecutado en Android 16/API 36 |
| iOS en simulador | Build y ejecución OK | Xcode 26.5, iOS 26.5 e iPhone 17 Pro; lanzamiento inicial solo iPhone |
| iOS para dispositivo | Build 1 subido | App Store Connect aceptó `1.0 (1)` el 19 de agosto de 2026 y está procesándolo |
| Firma de tienda | Google y Apple listas | Clave Google respaldada; Apple Distribution local fijado en las opciones de exportación |

Se han configurado iconos adaptativos/monocromos, splash oscuro, barras del
sistema, zonas seguras, teclado, navegación atrás, compartir, vibración, estado
de red y callback OAuth `es.diime.app://auth/callback`. Android no permite HTTP,
depuración de WebView ni copias de seguridad de datos de la app.

## Bloqueos que necesitan al titular

No son cambios que deban automatizarse con credenciales o claves inventadas:

1. Confirmar el estado actual de `1.0 (1)` en App Store Connect y completar o
   crear la ficha de Google Play con el identificador `es.diime.app`.
2. Las dos cuentas de revisión se crearon en producción el 4 de septiembre de
   2026. Queda probar sus accesos en los binarios y cargar sus contraseñas
   exclusivamente en las consolas.
3. Copiar las declaraciones ya auditadas de `STORE_COMPLIANCE_ES.md`, completar
   DSA como comerciante con la identidad legal real y elegir disponibilidad.
4. Probar registro, Google/Apple, publicación, reporte, mensajería, adjuntos,
   pago/reembolso y borrado de cuenta en un iPhone y un Android reales.
5. `CRON_SECRET` y `OPERATIONS_ALERT_EMAIL` ya están configurados en producción.
   Tras desplegar el panel `/admin/operaciones`, comprobar el primer control
   diario y su alerta a `contacto@diime.es`.

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

La clave de subida Google se generó el 19 de agosto de 2026. La copia principal
está en `~/Documents/Diime-Release/diime-upload.jks`, la segunda en iCloud Drive
(`Diime-Release/diime-upload-backup.jks`) y la contraseña en el Llavero de
macOS. Ambas copias tienen el mismo SHA-256 y permisos solo para el usuario. El
AAB firmado estable está en `~/Documents/Diime-Release/diime-1.0-1-signed.aab`.

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

El build se instala y arranca correctamente en el simulador iPhone 17 Pro Max.
El Release arm64 para dispositivo también compila y pasa la validación local con
firma desactivada. El proyecto ya incluye el entitlement **Sign in with Apple**.
Para publicar, abre el proyecto con `pnpm cap:ios`; en Xcode selecciona `App` →
**Signing & Capabilities**, el Team del titular y el identificador
`es.diime.app`. Comprueba versión `1.0` / build `1`, ejecuta primero en un iPhone
y después usa **Product → Archive → Distribute App → App Store Connect**.

### Valores exactos para Apple y Supabase

Después de activar Apple Developer como persona física:

1. Registrar un App ID explícito con descripción **Diime**, Bundle ID
   `es.diime.app` y capacidad **Sign in with Apple** como App ID primario.
2. Registrar el Services ID **Diime Web** con identificador `es.diime.web` y
   asociarlo al App ID anterior.
3. En la configuración web del Services ID usar:
   - Domain: `ndzpkwdkbnxaedsouwzx.supabase.co`
   - Return URL: `https://ndzpkwdkbnxaedsouwzx.supabase.co/auth/v1/callback`
4. Crear una key denominada **Diime Sign in with Apple**, descargar una sola vez
   el `.p8` y guardar dos copias seguras junto con su Key ID y el Team ID.
5. En Supabase → Authentication → Providers → Apple, colocar primero el Services
   ID en Client IDs: `es.diime.web,es.diime.app`, generar el client secret y
   activar el proveedor.
6. Añadir `es.diime.app://auth/callback` a las Redirect URLs de Supabase y
   desplegar `NEXT_PUBLIC_APPLE_LOGIN=true` solo cuando una prueba completa haya
   funcionado.

El client secret del flujo OAuth caduca como máximo a los seis meses. Hay que
rotarlo antes del vencimiento conservando la key `.p8`; perderla obliga a crear
y configurar una key nueva.

La key de Apple se creó el 19 de agosto de 2026 con Key ID `9ZYU8FCRKX` y Team
ID `DKX23L5985`. La copia principal está en
`~/Documents/Diime-Release/AuthKey_9ZYU8FCRKX.p8` y la segunda en iCloud Drive
(`Diime-Release/AuthKey_9ZYU8FCRKX-backup.p8`); ambas tienen permisos `600` y el
mismo SHA-256. El client secret de `es.diime.web` está guardado en el Llavero
como `Diime Apple OAuth Client Secret` y debe rotarse antes del
**15 de febrero de 2027 a las 14:58 UTC**.

El proveedor Apple quedó activo en Supabase con
`es.diime.web,es.diime.app`, se añadió el deep link a la lista de retornos y el
commit `833a95f` se desplegó en producción. Se comprobó que Apple aparece en
login y registro y que Supabase redirige a Apple tanto para el callback web como
para `es.diime.app://auth/callback`.

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
- El registro exige confirmar 18 años o más y aceptar Términos, Privacidad y
  Normas de la comunidad. Se han añadido filtro preventivo, reporte y bloqueo
  desde perfiles y conversaciones; hay que mantener el SLA operativo de
  moderación.
- No envíes la versión iOS mientras Google aparezca como login y Apple siga
  oculto: Apple suele exigir una opción equivalente de Sign in with Apple.
- El primer build iOS se firmó con el certificado local `Apple Distribution` y
  se subió a la ficha `6803130630`. No usar el certificado de distribución
  gestionado en la nube de esta cuenta: con el nombre acentuado del titular
  generó requisitos de firma inválidos (`90035`). Las opciones de exportación
  fijan el certificado local comprobado para evitar que Xcode vuelva a
  seleccionarlo.
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
