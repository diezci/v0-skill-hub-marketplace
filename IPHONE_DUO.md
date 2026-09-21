# Adaptación de Diime a iPhone Duo

Revisión: 21 de septiembre de 2026. Documentación de Apple consultada el 19 de septiembre.

Apple ha anunciado iPhone Duo y publicado sus [especificaciones](https://www.apple.com/iphone-duo/specs/) y [guías para desarrolladores](https://developer.apple.com/iphone-duo/). La interfaz se adapta al espacio que recibe, sin identificar el modelo ni convertir píxeles físicos en tamaños fijos de CSS.

## Cambios de interfaz

- El contenido, la cabecera y los diálogos respetan las áreas seguras izquierda y derecha de forma independiente.
- El menú desplegado, los diálogos y la vista de mensajes utilizan la altura visible. Los formularios largos se pueden desplazar al girar o abrir el teclado.
- `useViewportAdaptable` observa cambios de ventana y `VisualViewport`, agrupa eventos por frame y actualiza variables CSS. No remonta la página ni reinicia borradores, selección de conversación o filtros.
- El pinch del navegador no modifica por sí solo la altura de diseño. Si la ventana cambia de tamaño con zoom activo, se utiliza `innerHeight` de la ventana nueva y se deja al navegador desplazar el contenido ampliado; no se restablece la escala. Esto evita congelar una altura antigua cuando `window.resize` llega antes que `visualViewport.resize`. Al volver a escala normal se recupera la altura visible, incluido el espacio que deja el teclado. No se añade ningún bloqueo de zoom.
- La PWA permite orientación libre. El navbar conserva `fixed top-0` y el breakpoint de escritorio `xl`.

## Contenedor iOS y siguiente versión nativa

Diime conserva `TARGETED_DEVICE_FAMILY = 1` (iPhone), su ciclo de escenas y portrait/landscape. iPhone Duo sigue siendo un iPhone al abrirse; no es necesario habilitar iPad para esta adaptación.

Apple especifica que un binario compilado con un SDK anterior a iOS 27 funciona con un tamaño de compatibilidad. SDK 27 amplía la pantalla interior y SDK **27.1** permite ocuparla hasta los bordes. Las mejoras de la web no sustituyen esa recompilación y publicación del binario. [Preparar la app](https://developer.apple.com/videos/play/tech-talks/111461/).

El equipo disponible tiene Xcode 26.5, SDK iOS 26.5 y simulador iOS 26.5; no tiene runtime ni simulador de Duo. No se han cambiado el SDK mínimo, la familia de dispositivos, los permisos ni los destinos de distribución.

Antes de declarar compatibilidad nativa completa:

1. Compilar con Xcode/SDK 27.1 y ejecutar el simulador Duo.
2. Abrir y cerrar el dispositivo con formularios, chat y filtros activos, probar Split View y ambas orientaciones, y confirmar que permanecen el contenido y los controles.
3. Comprobar teclado, cámara, cambio de pantalla y regiones internas reservadas. Las variables CSS de áreas seguras no demuestran por sí solas que el pliegue o una cámara interior no ocluyan controles. [HIG de Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).
4. Validar el binario en un dispositivo real antes de distribuirlo como plenamente compatible.

## Verificación local

`node scripts/test-viewport-adaptable.mjs`: ocho escenarios comprueban cambios compacto/expandido/rotado/dividido (también con zoom activo), ambos órdenes de eventos de ventana y viewport visual en frames separados, apertura y cierre del teclado, pinch sin rediseño, valores transitorios inválidos, limpieza de listeners y respaldo sin `VisualViewport`.

Para la revisión visual se pueden usar ventanas representativas de 466 × 678, 890 × 626, 626 × 890, 390 × 626, 320 × 568 y 1280 × 900 CSS px, además de áreas seguras asimétricas. Son ventanas de prueba, no mediciones verificadas del viewport de Safari ni un sustituto del simulador oficial.

Revisión visual local del 19 de septiembre: notificaciones sin desbordamiento a 320, 390, 466, 626, 890 y 1280 px; el estado de aviso visto se conservó durante siete cambios de tamaño y el navbar siguió fijo arriba. El formulario real «Reportar» conservó su borrador durante siete cambios, incluido 466 × 350; el diálogo quedó dentro de áreas seguras simuladas de 47 px izquierda, 21 derecha, 24 arriba y 21 abajo al estabilizarse. Se canceló sin enviar. El menú móvil está dentro del contenedor de la cabecera y recibe sus márgenes seguros laterales.

Referencias adicionales: [preparación técnica](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo), [escenas y pantallas](https://developer.apple.com/videos/play/tech-talks/111464/), [WebKit: viewport-fit y áreas seguras](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
