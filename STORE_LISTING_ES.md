# Ficha de tiendas de Diime (borrador ES)

Este archivo prepara los campos, pero los datos legales, declaraciones de
privacidad y credenciales de revisión tienen que confirmarlos el titular y la
persona responsable del tratamiento. No copies a las consolas los elementos
marcados como **CONFIRMAR** sin revisarlos.

## Metadatos comunes

- **Nombre:** Diime
- **Categoría principal propuesta:** Estilo de vida
- **Categoría secundaria propuesta:** Negocios
- **URL de marketing:** https://www.diime.es
- **URL de soporte:** https://www.diime.es/ayuda
- **Política de privacidad:** https://www.diime.es/legal/privacidad
- **Opciones de privacidad / borrado:** https://www.diime.es/eliminar-cuenta
- **Términos:** https://www.diime.es/legal/terminos
- **Normas de la comunidad:** https://www.diime.es/legal/normas-comunidad
- **Correo de soporte:** contacto@diime.es
- **Idioma principal:** Español (España)

### App Store

- **Subtítulo (máx. 30):** Servicios cerca de ti
- **Texto promocional:** Encuentra profesionales, compara ofertas y gestiona tus servicios desde un solo lugar.
- **Palabras clave:** profesionales,servicios,reformas,limpieza,reparaciones,ofertas,trabajo,España
- **SKU propuesto:** DIIME-IOS-001
- **Copyright:** **CONFIRMAR titular legal y año**

### Google Play

- **Descripción breve (máx. 80):** Publica lo que necesitas y recibe ofertas de profesionales verificados.

### Descripción larga

Diime conecta a personas que necesitan un servicio con profesionales de su
zona. Publica tu necesidad, recibe ofertas y elige con más información y control.

Con Diime puedes:

- Publicar una solicitud de servicio.
- Descubrir perfiles profesionales y consultar sus valoraciones.
- Enviar y comparar ofertas.
- Hablar por mensajería y compartir adjuntos.
- Gestionar el progreso de tus trabajos.
- Pagar servicios contratados mediante Stripe.
- Abrir incidencias y consultar su resolución.
- Administrar tus datos y eliminar tu cuenta desde la app.

Los servicios se acuerdan entre usuarios y se prestan fuera de la aplicación.
La disponibilidad de profesionales depende de la categoría y la zona.

## Notas para App Review / Google review

> Diime es un marketplace de servicios persona a persona. Los servicios se
> prestan fuera de la aplicación; no se venden bienes digitales ni se desbloquea
> contenido o funcionalidad digital. Stripe procesa pagos asociados a esos
> servicios.
>
> El borrado se encuentra en Mi cuenta → Eliminar mi cuenta y también puede
> iniciarse desde https://www.diime.es/eliminar-cuenta. Los reportes se
> encuentran en Incidencias, los perfiles y el pie de la aplicación. Los
> usuarios pueden bloquear a otra persona desde su perfil o conversación. Soporte:
> contacto@diime.es.
>
> La experiencia nativa incluye navegación inferior específica, zonas seguras,
> gestión del teclado y del botón Atrás, feedback háptico, compartir nativo,
> detección de red, retorno OAuth por deep link y pantalla offline integrada.
>
> Cuenta cliente: **CONFIRMAR correo / contraseña**
>
> Cuenta profesional: **CONFIRMAR correo / contraseña**
>
> Recorrido de prueba sin cobro real: **CONFIRMAR instrucciones y datos**

No incluyas una contraseña real o reutilizada. Crea cuentas exclusivas para
revisión, con datos ficticios estables y sin autenticación multifactor que impida
el acceso del revisor.

## Privacidad: inventario que hay que confirmar

La respuesta debe cubrir tanto a Diime como a Supabase, Stripe, Vercel, Resend y
cualquier servicio habilitado en producción.

| Dato o uso posible | Motivo visible en el producto | Acción |
| --- | --- | --- |
| Nombre, email, teléfono y foto | Cuenta, perfil y contacto | Declarar si se guarda en producción |
| Provincia/ubicación introducida | Encontrar servicios cercanos | No declarar GPS si nunca se solicita |
| Perfiles, solicitudes y ofertas | Función principal del marketplace | Declarar contenido del usuario |
| Mensajes, reseñas y adjuntos | Comunicación y reputación | Declarar contenido del usuario |
| IDs de cuenta/dispositivo | Autenticación y seguridad | Confirmar con Supabase y logs |
| Historial de pagos/reembolsos | Gestión del trabajo | Declarar compras/transacciones |
| Datos de tarjeta | Los procesa Stripe | Confirmar que Diime no los recibe ni almacena |
| Uso y diagnóstico | Vercel Analytics y logs | Confirmar configuración y consentimiento |
| Emails transaccionales | Resend | Declarar email compartido para funcionalidad |

Confirmaciones imprescindibles:

- Si cada dato está vinculado a la identidad del usuario.
- Si se usa para seguimiento entre apps o sitios. La respuesta esperada es
  **no**, pero debe comprobarse en los paneles y contratos reales.
- Plazos de retención, proceso de supresión y tratamiento de datos legales que
  deban conservarse tras borrar la cuenta.
- Formularios **App Privacy** de Apple y **Data safety** de Google coherentes con
  la política publicada.

Apple exige una URL de privacidad y la declaración de las prácticas propias y de
terceros: [App privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).

### Borrador para App Privacy de Apple

El binario iOS ya incluye `PrivacyInfo.xcprivacy` con **tracking = no**. En App
Store Connect declara como vinculados al usuario y usados para funcionalidad:

- Nombre, email, teléfono y dirección/datos de contacto.
- Provincia aproximada introducida manualmente; no ubicación precisa ni GPS.
- Información de pago e historial de compras; la tarjeta la procesa Stripe.
- Fotos/vídeos y otro contenido del usuario: perfiles, demandas, ofertas,
  mensajes, archivos y valoraciones.
- Atención al cliente e identificador de usuario.
- Interacción con el producto para funcionalidad y analítica.

No declarar publicidad de terceros, publicidad del desarrollador ni tracking
entre apps/sitios mientras la configuración de producción siga siendo la
auditada. **CONFIRMAR** en Vercel, Stripe, Supabase y Resend antes de enviarlo.

### Borrador para Data safety de Google Play

- **¿Recopila datos?** Sí.
- **¿Comparte datos?** Propuesta: no, considerando a Supabase, Stripe, Vercel y
  Resend encargados/proveedores de servicio. Confirmar contratos y usos reales.
- **¿Cifrados en tránsito?** Sí, todo el tráfico de producción usa HTTPS/TLS.
- **¿Puede solicitarse el borrado?** Sí, dentro de la app y en
  `https://www.diime.es/eliminar-cuenta`.
- **Datos obligatorios:** email, nombre, credenciales/ID de cuenta y documento
  identificativo necesario para contratar/facturar.
- **Datos opcionales o dependientes de función:** teléfono, provincia, fotos,
  archivos, mensajes, perfil profesional, ofertas, valoraciones e incidencias.
- **Finalidades:** funcionalidad de la app, gestión de cuenta, prevención de
  fraude/seguridad, comunicaciones del desarrollador y analítica.
- **Procesamiento efímero:** datos de tarjeta, si Stripe confirma que Diime no
  los almacena. La transacción y su estado sí se conservan.

La URL pública de borrado y las respuestas de Data safety deben cargarse también
en los tracks cerrados; Google las exige fuera del testing interno.

## Clasificación y cumplimiento

- Declarar mensajería, contenido generado por usuarios y compras de servicios.
- **CONFIRMAR** que no se permiten contenido sexual, apuestas, alcohol, drogas,
  violencia ni servicios regulados; si alguno existe, reflejarlo en edad y países.
- Completar el estado de comerciante de la Digital Services Act para distribución
  en la UE.
- Validar que el nombre legal, dirección y teléfono mostrados por las tiendas son
  los del titular de las cuentas.
- Mantener un SLA de moderación y un canal atendido en contacto@diime.es.
- La app ya exige aceptar Términos, Privacidad y Normas de la comunidad antes
  del registro; filtra señales claras de contenido prohibido y ofrece reporte y
  bloqueo desde perfiles y conversaciones.
- **CONFIRMAR edad mínima contractual.** Por pagos, contratación e identificación
  se recomienda limitar el registro a mayores de 18 años y reflejarlo en los
  términos antes de completar los cuestionarios de edad.

## Recursos gráficos pendientes

1. Capturar pantallas sin datos reales: portada, publicación, resultados,
   ofertas, chat y gestión del trabajo.
2. Para App Store, aportar de 1 a 10 imágenes sin transparencia en un tamaño
   iPhone aceptado; el lanzamiento inicial está configurado solo para iPhone,
   por lo que no requiere recursos de iPad. Consulta las
   [medidas vigentes](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).
3. Para Google Play, preparar icono de ficha 512×512, imagen destacada
   1024×500 y al menos dos capturas de teléfono. Consulta las
   [reglas de recursos](https://support.google.com/googleplay/android-developer/answer/9866151?hl=es).
4. Las capturas deben representar exactamente la versión enviada y no mostrar
   precios, rankings o afirmaciones no demostrables.

Recursos ya preparados en `store-assets/`:

- Icono Google Play 512×512.
- Imagen destacada Google Play 1024×500.
- Captura Android de teléfono ajustada a la proporción admitida.
- Captura base de iPhone ajustada a un tamaño 6,9 pulgadas aceptado por App
  Store. Es solo una previsualización: todavía muestra el aviso de cookies de
  la versión web anterior y debe regenerarse después del despliegue.

Faltan una segunda captura Android y las capturas con sesión de resultados,
ofertas, chat y trabajo. Para obtenerlas sin datos reales hacen falta las dos
cuentas de revisión y datos de demostración estables. Hay que regenerar el set
completo después de desplegar esta versión, para que represente exactamente el
binario enviado.
