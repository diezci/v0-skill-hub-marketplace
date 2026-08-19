# Cumplimiento de tiendas de Diime

Estado auditado el **19 de agosto de 2026**. Este documento es la fuente de
verdad para rellenar App Store Connect y Google Play Console. Las respuestas se
basan en el código y en los permisos del binario actual.

## Identidad de la aplicación

- **Nombre:** Diime
- **Bundle ID / Package name definitivo:** `es.diime.app`
- **iOS:** confirmado en `capacitor.config.ts` y en los dos ajustes de build del
  proyecto Xcode.
- **Android:** confirmado como `namespace` y `applicationId`.
- **Deep link OAuth:** `es.diime.app://auth/callback`.

El identificador queda bloqueado para las dos tiendas. No crear la ficha con un
ID distinto: después de subir una build Apple no permite cambiar el Bundle ID.

## Titular y comerciante DSA

### Decisión

Seleccionar **Sí, comerciante (trader)**. Diime se explota como marketplace de
servicios, intermedia contratos y pagos y aplica comisiones; no es una actividad
puramente personal o no profesional.

### Datos confirmados del titular

- **Tipo de titular:** persona física.
- **Nombre legal:** Juan Díez García.
- **NIF:** [redacted].
- **Domicilio público:** Calle Pedro Muguruza 8, 2.º B, 28036 Madrid, España.
- **Teléfono público:** +34 657 738 042.
- **Email público:** `contacto@diime.es`.
- **D-U-N-S:** no aplica si la cuenta Apple se da de alta como persona física.

En Apple, completar **Business → Digital Services Act → Trader status**, elegir
persona física y comerciante, copiar estos datos exactamente, verificar email y
teléfono, aportar el documento que solicite y certificar que los servicios
ofrecidos cumplen la legislación de la UE. En Google, elegir cuenta personal y
hacer coincidir el perfil de desarrollador con la misma identidad.

El titular ha confirmado que este domicilio y teléfono pueden utilizarse como
datos públicos del comerciante. Si cambian, hay que actualizar la web y ambas
tiendas antes de la siguiente publicación.

## Edad y público objetivo

Diime es un servicio **solo para mayores de 18 años**:

- El registro por email y OAuth exige una confirmación separada de mayoría de
  edad y aceptación legal.
- Se conserva la fecha y versión de la confirmación, no la fecha de nacimiento.
- Los usuarios anteriores sin constancia reciben un bloqueo de continuación
  hasta confirmar o cerrar sesión.
- Los Términos recogen la edad mínima y la capacidad para contratar.

### App Store Connect → Age Ratings

- Parental Controls: **No**.
- Age Assurance: **Sí** (autodeclaración 18+).
- Messaging and Chat: **Sí**.
- User-Generated Content: **Sí**.
- Advertising: **No**.
- Unrestricted Web Access: **No**. Los enlaces externos puntuales se abren en el
  navegador del sistema; Diime no permite navegar libremente por la web.
- Social Media: **No**.
- Contenido maduro, violencia, sexualidad, drogas, apuestas, loot boxes y
  concursos: **None / No** según corresponda.
- Made for Kids: **No**.
- **Override to Higher Age Rating: 18+**, porque el EULA/Términos exige 18 años.
  En sistemas antiguos Apple mostrará su equivalencia regional aplicable.

### Google Play → Target audience and content

- Grupo de edad: **18 and over** únicamente.
- La app no está dirigida a niños: **No**.
- Ads: **No** y no contiene SDK publicitario.
- IARC/UGC: contenido generado por usuarios **Sí**; comunicación entre usuarios
  **Sí**; compartir imágenes/archivos **Sí**.
- Fully moderated content: **No**. Hay filtros preventivos y moderación, pero los
  reportes también se revisan de forma reactiva.
- Compras digitales: **No**. Stripe procesa pagos de servicios reales prestados
  fuera de la app, no contenido ni funciones digitales.

## App Privacy de Apple

Valores comunes de todas las filas: **Linked to the user = Yes**, **Used for
tracking = No** y propósito **App Functionality**, salvo que se indique otra
cosa.

| Categoría de Apple | Declaración | Motivo |
| --- | --- | --- |
| Contact Info → Name | Sí | Perfil, contratos y facturación |
| Contact Info → Email Address | Sí | Cuenta y avisos transaccionales |
| Contact Info → Phone Number | Sí, opcional | Contacto entre partes |
| Contact Info → Physical Address | **No** | Se pide provincia, no dirección postal |
| Location → Coarse Location | Sí | Provincia manual e IP técnica; nunca GPS |
| Location → Precise Location | **No** | No se solicita ni se infiere |
| Financial Info → Payment Info | **No** | La tarjeta se introduce en Stripe y Diime no accede a ella |
| Financial Info → Purchase History | Sí | Pagos, reembolsos y trabajos |
| User Content → Emails or Text Messages | Sí | Chat privado dentro de Diime |
| User Content → Photos or Videos | Sí, opcional | Fotos y adjuntos elegidos por el usuario |
| User Content → Customer Support | Sí, opcional | Incidencias y soporte |
| User Content → Other User Content | Sí, opcional | Demandas, ofertas, reseñas, archivos y calendario interno |
| Identifiers → User ID | Sí | ID de cuenta de Supabase |
| Usage Data → Product Interaction | Sí | Solicitudes web necesarias y registros técnicos |
| Other Data | Sí | DNI/NIE/CIF y constancia 18+ |

No declarar: dirección postal, tarjeta/cuenta bancaria, ubicación precisa,
contactos del dispositivo, historial de navegación externo, publicidad, Device
ID, datos de salud, audio, tracking ni venta de datos.

La manifestación nativa `ios/App/App/PrivacyInfo.xcprivacy` ya refleja esta
matriz. La URL de la ficha es `https://www.diime.es/legal/privacidad` y Privacy
Choices puede apuntar a `https://www.diime.es/eliminar-cuenta`.

## Data safety de Google Play

Respuestas de cabecera:

- Does your app collect or share user data?: **Yes**.
- Is all user data encrypted in transit?: **Yes**.
- Do you provide a way for users to request deletion?: **Yes**.
- Account deletion URL: `https://www.diime.es/eliminar-cuenta`.
- Is the app independently security reviewed?: **No**, salvo que se obtenga y se
  mantenga una certificación aceptada por Google.
- Data sharing: **No**. Supabase, Stripe, Vercel y Resend actúan como proveedores
  de servicio; los envíos visibles a otro usuario son iniciados por el propio
  usuario. Revisar esta respuesta si se incorpora un tercero que use datos para
  fines propios.

### Datos recopilados

| Dato de Google Play | Obligatorio/opcional | Finalidad |
| --- | --- | --- |
| Approximate location | Obligatorio | Funcionalidad y seguridad; provincia/IP, no GPS |
| Name | Obligatorio | App functionality, account management |
| Email address | Obligatorio | App functionality, account management |
| User IDs | Obligatorio | App functionality, account management, security |
| Phone number | Opcional | App functionality |
| Other personal info | Obligatorio | Confirmación 18+; DNI/NIE/CIF según el tipo de alta |
| Purchase history | Opcional | App functionality, fraud prevention/security |
| Other in-app messages | Opcional | App functionality |
| Photos | Opcional | App functionality |
| Videos | Opcional | App functionality; el adjunto puede ser vídeo |
| Files and docs | Opcional | App functionality |
| Calendar events | Opcional | App functionality; calendario interno de proyectos |
| Other user-generated content | Opcional | Demandas, ofertas, reseñas e incidencias |
| App interactions | Obligatorio | App functionality y seguridad mediante registros técnicos |

No marcar `User payment info`: el número de tarjeta se procesa dentro de Stripe
y no llega a Diime. Tampoco marcar ubicación precisa, contactos, SMS/MMS, emails
del buzón, salud, audio, historial de navegación, historial de búsqueda, apps
instaladas, Device or other IDs, anuncios ni personalización publicitaria.

## Evidencia técnica de la auditoría

- Android declara únicamente el permiso `INTERNET`; no declara ubicación,
  contactos ni lectura persistente de fotos/vídeos.
- iOS solo explica cámara y selección de fotos para adjuntos iniciados por el
  usuario; no incluye claves de ubicación ni ATT.
- No hay SDK de anuncios, atribución, tracking, Sentry, Firebase Analytics,
  PostHog, Segment, Mixpanel ni Google Analytics.
- La dependencia sin uso de Vercel Analytics se eliminó. La app nativa fuerza
  «solo necesarias» y no carga analítica opcional.
- Stripe aloja el formulario de pago. Diime guarda IDs y estado de la
  transacción, no el número completo de tarjeta.
- Proveedores activos: Supabase, Stripe, Vercel Blob/hosting y Resend.

## Verificación pendiente en las consolas

La identidad del titular y el estatus de comerciante ya están confirmados. El
aviso legal y la identificación del responsable de privacidad están preparados.
Solo queda copiar estos datos en App Store Connect y Google Play Console, superar
la verificación documental, de email y teléfono que solicite cada plataforma y
aceptar sus declaraciones finales desde las cuentas del titular.
