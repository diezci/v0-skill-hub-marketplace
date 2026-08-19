# Ficha de tiendas de Diime (borrador ES)

Este archivo prepara los metadatos comerciales. Las declaraciones técnicas de
privacidad, edad y DSA ya están auditadas en `STORE_COMPLIANCE_ES.md`; siguen
pendientes la verificación del titular en las consolas y las credenciales de revisión. No
copies a las consolas los elementos marcados como **CONFIRMAR** sin revisarlos.

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
- **Copyright:** 2026 Juan Díez García

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

## Privacidad, edad y DSA

La auditoría definitiva, con cada casilla de App Privacy y Data safety, está en
[`STORE_COMPLIANCE_ES.md`](./STORE_COMPLIANCE_ES.md). Sustituye los borradores
anteriores y coincide con el manifiesto de privacidad iOS y los permisos Android.

Resumen confirmado:

- Identificador definitivo: `es.diime.app` en ambas plataformas.
- Público contractual: solo personas de 18 años o más.
- Comerciante DSA: **Sí**.
- Tracking, anuncios, GPS y lectura persistente de la fototeca: **No**.
- Tarjeta/cuenta bancaria: **No recopilada por Diime**; Stripe aloja el campo.
- Historial de la transacción: **Sí recopilado**.
- Analítica opcional: **No activada**.
- Titular confirmado como persona física y comerciante DSA; los datos exactos
  que deben copiarse y verificarse están en `STORE_COMPLIANCE_ES.md`.

## Clasificación y cumplimiento

- Declarar mensajería, contenido generado por usuarios y compras de servicios.
- No declarar contenido sexual, apuestas, alcohol, drogas o violencia: están
  prohibidos y no forman parte de la experiencia ofrecida.
- Completar DSA como comerciante para la distribución en la UE.
- Validar que el nombre legal, dirección y teléfono mostrados por las tiendas son
  los del titular de las cuentas.
- Mantener un SLA de moderación y un canal atendido en contacto@diime.es.
- La app ya exige aceptar Términos, Privacidad y Normas de la comunidad antes
  del registro; filtra señales claras de contenido prohibido y ofrece reporte y
  bloqueo desde perfiles y conversaciones.
- Edad mínima contractual confirmada: **18 años**. Registro, OAuth, cuentas
  anteriores, Términos y persistencia de la aceptación quedan alineados.

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
- Captura nativa de onboarding en iPhone 17 Pro Max (`1320×2868`, JPEG sin
  transparencia), generada después del despliegue y utilizable en App Store.

Faltan una segunda captura Android y las capturas con sesión de resultados,
ofertas, chat y trabajo. Para obtenerlas sin datos reales hacen falta las dos
cuentas de revisión y datos de demostración estables. Hay que regenerar el set
completo después de desplegar esta versión, para que represente exactamente el
binario enviado.
