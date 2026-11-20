# Pagos en la app de Diime · comprobación del 15 al 20 de noviembre de 2026

**Los cuatro contratos terminaron con sus pagos y transferencias conciliados.** Se utilizaron cuatro contratos sintéticos, uno de pago único y uno de dos hitos por plataforma. Todos los importes corresponden a la cuenta independiente Diime Workflow QA de Stripe en modo TEST. Para conciliar un pago se comprueban el contrato, el hito cuando corresponde, el importe capturado, el cargo de origen y la transferencia al proveedor. Una sesión de pago caducada se conserva como intento separado.

| App | Contrato | Cliente, capturado | Proveedor, transferido | Último paso confirmado |
| --- | --- | ---: | ---: | --- |
| iOS | Pago único | 12 € | 8 € | Pago, entrega y aprobación completados. El proveedor abrió su justificante y volvió al historial dentro de la app. |
| iOS | Dos hitos | 22 € + 33 € | 18 € + 27 € | Corrección y nueva entrega, certificación de las dos fases y justificante con ambas liquidadas. El cliente volvió al plan por su enlace. |
| Android | Pago único | 12 € | 8 € | Cobro con 3DS, retorno, entrega, aprobación, apertura del justificante por ambas partes y vuelta a su área. |
| Android | Dos hitos | 22 € + 33 € | 18 € + 27 € | Cambios, nueva entrega, certificación de las dos fases y regreso del justificante al plan como cliente y proveedor. La app conservó ambos estados tras volver del segundo plano. |

**Conciliación final.** Stripe registró seis cargos por 134 € y seis transferencias a las cuentas de prueba de los proveedores por 106 €. Los 28 € de diferencia corresponden a gastos brutos de servicio antes del coste de procesamiento. Hay un corte con cero transferencias antes de la aprobación para cada cargo. Dos intentos de pago único y uno del primer hito caducaron en Android, todos con cero importe capturado y transferido.

El cliente y el proveedor se identifican con sus propias cuentas de prueba. Las solicitudes, las ofertas y los contratos se preparan mediante las acciones de Diime. El cobro, las entregas, la certificación y el regreso a la app se comprueban desde las pantallas de cada dispositivo. La auditoría financiera consulta por separado PostgreSQL y Stripe.

## Hallazgos y correcciones

- En iOS, abrir un justificante protegido enviaba al usuario a Safari, donde faltaba la sesión de Diime. La app ahora abre el documento en su propia pantalla y ofrece un enlace para volver. En web el documento se abre en una pestaña nueva.
- El plan de hitos carecía de acceso al justificante. Cliente y proveedor disponen del enlace junto al resumen económico del contrato. La vista de demostración lo omite.
- Se observó un 404 transitorio al consultar un justificante autorizado durante una caída de la conexión con la base. Al repetir, los dos participantes pudieron leer sus cuatro documentos. La aplicación ofrece reintentar los errores de red o del servidor, sin mostrar importes parciales. Los documentos inexistentes y los accesos denegados conservan el 404. Las ocho lecturas autenticadas se repitieron después del cambio.
- Un trabajo ya pagado podía mostrarse como pendiente si fallaba la consulta de sus cobros. Se reprodujo con un proveedor con 311 trabajos de prueba. Antes fallaron 68 consultas. Con el cambio, la lista cargó los 311 trabajos y mostró el pago completado con el neto correcto. Si una lectura financiera falla, la pantalla permite reintentar y conserva los datos anteriores.
- En el resumen de un contrato por hitos, el proveedor veía únicamente el último pago. Se suman los netos liquidados de todos los hitos para los trabajos completados. En los activos se cuentan los importes todavía retenidos. Los intentos caducados aportan cero. El pago único conserva su cálculo anterior.

## Ejecución en simuladores

Se conservan el dispositivo iOS 26.5 y un clon de Android API 35 con la app interna es.diime.hitos.qa. En iOS, XCTest mantiene los gestos y la sesión de la app. Se limitó la espera de animaciones en el ejecutor de prueba y se comprueba por separado el resultado de cada operación. En Android, el emulador arrancó con aceleración gráfica del equipo, Vulkan desactivado, dos núcleos y 2560 MB. ADB comunica el dispositivo con los servicios locales de Diime en los puertos 3214 y 54321.

En iOS se canceló un desafío 3DS de prueba y se completó el reintento. Stripe registró un único cargo correcto del primer hito. El segundo hito permaneció bloqueado hasta la certificación del primero. Pedir cambios y volver a entregar el primer hito conservó los fondos hasta su aprobación.

En Android, una pérdida de DNS impedía que el formulario de Stripe terminara de cargar. Durante la prueba, el tráfico HTTPS de Stripe se encaminó por el Mac con un proxy CONNECT de acceso local limitado a sus dominios. La conexión mantuvo la validación TLS y al terminar se retiró la configuración del clon.

En Chrome se comprobó la publicación con cuenta de cliente QA. El pago único aparecía seleccionado. Al elegir pago por hitos se añadieron dos fases, se quitó la primera y la segunda conservó su título. Se pudo volver a pago único. El proveedor abrió «Enviar presupuesto» desde una demanda de prueba, cambió a hitos, añadió y quitó una fase y volvió al pago único. Ambas comprobaciones se hicieron sin enviar el formulario.

## Registros y comprobaciones reproducibles

Las evidencias locales son privadas. Las capturas iOS y sus identificadores se guardan en `.build/native-hitos-20261115/xcui/evidence/`. La trazabilidad financiera y los intentos caducados se guardan en `.build/hitos-stripe-test-20261115/audit-all-latest.json` y en los cortes anteriores con marca de tiempo. Los escenarios de negociación, edición del plan, disputa, cancelación y devolución en web se detallan en [la validación financiera del 14 de noviembre](validacion-stripe-test-2026-11-14.md).

El 20 de noviembre se volvieron a comprobar en producción las tres migraciones de hitos y las 55 condiciones de permisos, integridad y compatibilidad en `supabase/tests/hitos-release-verification.sql`. Las 55 se cumplen. La revisión de justificantes y listados solo modifica la aplicación.

En la versión integrada pasaron 98 pruebas de navegación, permisos, pagos y edición del plan. También se ejecutaron 12 pruebas de recuperación del listado, 15 de justificantes e IVA, 25 de cobros empresariales, la prueba de notificaciones de cuenta Stripe y la comprobación de tipos. Los totales finales del proveedor se verificaron con su historial de 311 trabajos. Cada contrato de dos hitos muestra 45 € liquidados y 0 € retenidos.
