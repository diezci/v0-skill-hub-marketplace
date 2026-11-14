# Validación financiera de pagos por hitos — 14 de noviembre de 2026

Resultado: cinco pagos mediante Checkout real de Stripe TEST, cuatro transferencias Connect y dos devoluciones conciliados correctamente. Se conservó el pago único. Se utilizó exclusivamente el sandbox independiente **Diime Workflow QA** (`acct_1USOyz3B6hPi56bO`), con claves restringidas de prueba; cada operación comprobó `livemode=false`. No hubo cargos live ni cambios en producción durante esta validación.

| Caso | Cobrado TEST | Transferido Connect | Reembolsado | Retención bruta Diime | Estado final |
| --- | ---: | ---: | ---: | ---: | --- |
| Pago único | 12,00 € | 8,00 € | 0,00 € | 4,00 € | Completado |
| Contrato de dos hitos | 22,00 € + 33,00 € | 18,00 € + 27,00 € | 0,00 € | 10,00 € | Ambos completados; contrato completado |
| Mediación parcial del primer hito | 22,00 € | 10,80 € | 8,00 € | 3,20 € | Primer hito resuelto; siguiente pendiente |
| Cancelación del primer hito | 22,00 € | 0,00 € | 20,00 € | 2,00 € | Contrato y siguiente hito cancelados |
| **Total** | **111,00 €** | **63,80 €** | **28,00 €** | **19,20 €** | |

La retención indicada es bruta, antes de los costes de procesamiento de Stripe. Los importes son simulados: las operaciones del sandbox no mueven dinero real. [Pruebas de Stripe](https://docs.stripe.com/testing).

## Recorrido comprobado

- Solicitudes, ofertas y contratos creados mediante las acciones HTTP reales de Next, con Auth y PostgreSQL locales y usuarios sintéticos. La aceptación de una oferta por hitos exige la versión actual del plan.
- Los cinco cargos se completaron en Checkout web. El primer hito nominal pasó un desafío 3DS; el cargo real de prueba registra `authentication_flow=challenge`, `result=authenticated`, versión `2.1.0`.
- Un pago capturado no transfirió dinero antes de entrega y aprobación. La autoaprobación del proveedor, la aprobación prematura y la financiación anticipada del siguiente hito se rechazaron.
- Entrega, solicitud de cambios y nueva entrega del hito conservaron los fondos. Dos aprobaciones concurrentes y un reintento produjeron una sola transferencia por pago, con cargo de origen, destino Connect e identidad del contrato/hito/pago correctos.
- La mediación rechazó un reembolso superior al importe de servicio de ese hito. Resolver de nuevo el mismo expediente conservó una devolución y una transferencia.
- La cancelación rechazó una aceptación de una versión anterior. Dos aceptaciones simultáneas y otro reintento devolvieron el servicio una sola vez, conservaron los gastos de cliente y cancelaron los hitos futuros.
- La auditoría final volvió a leer todos los objetos desde Stripe y todas las liquidaciones locales: cinco cargos, cuatro transferencias y dos devoluciones; ningún movimiento duplicado y conservación de los importes.

## Webhooks

Se observaron **siete eventos auténticos de Stripe**: cinco `checkout.session.completed` y dos `refund.updated`. El listener de Stripe los reenvió al servidor local, que respondió 200 y los registró como completados al primer intento.

Para cada evento se recuperó el payload original desde Stripe y se hicieron dos reenvíos firmados con el secreto local de prueba: **14 duplicados** respondieron `duplicate: true` sin cambiar el evento, el pago ni el trabajo. Estos reenvíos son pruebas generadas localmente, distintas de las siete entregas originales de Stripe. Las peticiones sin firma y con firma incorrecta devolvieron 400.

## Archivos privados

En el segundo hito nominal se subieron dos archivos de texto sintéticos mediante los endpoints reales de reserva y confirmación y la subida firmada de Supabase Storage. Uno documentó la entrega y el otro la solicitud de cambios. Se verificaron entrega, rechazo, nueva entrega y conservación de ambas referencias en el historial.

Las descargas utilizaron HTTPS local con una CA limitada al proceso de prueba mediante `NODE_EXTRA_CA_CERTS`; no se desactivó la validación de certificados ni se cambió la confianza del sistema o del navegador. El dueño pudo leer el archivo; la contraparte recibió 404 antes de adjuntarlo y 200 después; un usuario ajeno recibió 404 y una petición anónima, 401. Las respuestas privadas conservaron `private, no-store`.

## Defecto encontrado y regresión

El recorrido completo detectó que el adaptador de destino Connect todavía exigía `pendiente_pago`, por lo que impedía iniciar el segundo hito de un trabajo `en_progreso`. La migración `20261114205032_hitos_destino_cobro_siguientes_fases.sql` permite continuar únicamente contratos por hitos con un destino ya fijado y conserva las comprobaciones de identidad, permisos y destino inmutable.

Tras aplicarla al entorno local, el mismo contrato y el primer pago intacto permitieron crear, cobrar y liquidar el segundo hito. La suite financiera SQL pasó **15 grupos de escenarios**, ahora ejecutando la cadena completa `empresa_fijar_destino_cobro_trabajo` → `preparar_pago_hito`. Incluye rechazos para otro destino, otro actor y un contrato de pago único ya iniciado.

## Evidencia y reproducción

Los scripts reproducibles están en `scripts/e2e/hitos-*`. Las credenciales, certificados privados, registros y manifiestos detallados se conservan exclusivamente en el directorio ignorado `.build/hitos-stripe-test-20261114/`:

- `final-financial-proof.json`: auditoría final de objetos Stripe y estados de contratos.
- `checkout-*-proof.json`: acciones, importes, concurrencia y resultados por escenario.
- `webhook-*-proof.json`: siete eventos originales, firmas rechazadas y duplicados.
- `storage-private-proof.json`: archivos reales y comprobaciones de acceso.
- `checkout-fixtures.json`: identificadores de los cuatro contratos y cinco sesiones Checkout.

Los scripts rechazan claves live, otra cuenta Stripe y bases fuera de loopback. El listener no registra ni modifica endpoints alojados. La falta de permiso para crear PaymentIntents directamente se resolvió usando el Checkout existente; no se ampliaron permisos de la clave.

Esta evidencia cubre Checkout **web**, acciones HTTP reales, conciliación financiera y Storage. No acredita el retorno del pago en dispositivos iOS/Android, una transferencia bancaria efectiva ni los resultados de disputas bancarias reales. Los escenarios de contracargos, devoluciones fallidas y recuperación de interrupciones siguen cubiertos por las pruebas SQL y las pruebas aisladas de Stripe; no se presentan como ejecuciones de red de esta tanda.
