# Operación diaria de Diime

Este procedimiento cubre pagos, liquidaciones, mensajería, notificaciones y
moderación. La persona de guardia revisa `/admin/operaciones` cada día laborable
a las 09:00, hora de Madrid, y atiende inmediatamente cualquier alerta crítica.

## Niveles de prioridad

| Nivel | Ejemplos | Primera respuesta | Objetivo de resolución |
| --- | --- | ---: | ---: |
| P0 | Doble cobro, transferencia incorrecta, fuga de datos, servicio caído | 15 min | Contener en 1 h |
| P1 | Liquidación o webhook fallido, contracargo, abuso grave, incidencia crítica | 1 h | 4 h |
| P2 | Email/push fallido, disputa normal, incidencia alta | 4 h | 1 día laborable |
| P3 | Consultas generales y defectos menores | 1 día laborable | 3 días laborables |

## Revisión de las 09:00

1. Abrir `/admin/operaciones` y comprobar eventos técnicos abiertos.
2. Revisar webhooks Stripe fallidos o atascados y contrastar el identificador en
   Stripe antes de reintentar. Nunca crear manualmente un segundo pago o
   transferencia.
3. Revisar liquidaciones con estado `error` o `procesando` durante más de 15
   minutos. Confirmar primero en Stripe si el movimiento existe.
4. Atender incidencias críticas y disputas con más de 24 horas.
5. Comprobar fallos de Resend, FCM y APNs. Los avisos sin dispositivos
   registrados no se consideran error.
6. Resolver o documentar cada evento en el panel. Si depende de un tercero,
   registrar responsable y próxima revisión.
7. Revisar solicitudes de Madrid sin oferta después de cuatro horas y activar
   matching manual durante el piloto.

## Pagos y liquidaciones

- La base de datos y Stripe deben coincidir antes de cambiar estados.
- Buscar siempre por `payment_intent`, `transfer`, `refund` o evento webhook.
- Usar los reintentos idempotentes existentes; nunca repetir una operación con
  una clave diferente para “desatascarla”.
- Un contracargo se gestiona en Stripe y en la disputa de Diime antes de la fecha
  límite indicada por Stripe.
- Cualquier diferencia de importe, moneda o destinatario es P0: detener nuevas
  liquidaciones y conservar logs y evidencias.

## Moderación y soporte

- Riesgo inmediato para una persona o posible actividad delictiva: ocultar el
  contenido, preservar evidencia mínima y escalar como P0/P1.
- Acoso, fraude, suplantación o contenido prohibido: acusar recibo, revisar
  conversación y contexto, aplicar bloqueo si procede y documentar la decisión.
- No compartir con una parte datos privados de la otra.
- Las decisiones económicas se justifican con el alcance acordado, evidencias y
  movimientos reales; nunca solo con el relato de una parte.
- El buzón `contacto@diime.es` y el panel de administración deben revisarse al
  inicio y al final de cada jornada.

## Alertas automáticas

`/api/cron/operaciones` genera un resumen y envía correo solo si hay elementos
accionables. Vercel lo ejecuta diariamente a las 07:00 UTC mediante
`vercel.json` (09:00 CEST y 08:00 CET). La revisión humana se mantiene a las
09:00 de Madrid para absorber el cambio de horario estacional.

Variables necesarias:

- `CRON_SECRET`: autentica la llamada de Vercel Cron.
- `OPERATIONS_ALERT_EMAIL`: destinatario; si falta se usa
  `contacto@diime.es`.
- `RESEND_API_KEY` y `RESEND_FROM`: envío del aviso. El dominio exacto usado en
  `RESEND_FROM` debe estar verificado en Resend mediante SPF y DKIM; no basta
  con que el buzón exista.
- Las credenciales de Supabase con service role para consultar registros
  técnicos sin exponerlos al navegador.

El panel y el correo cubren webhooks, liquidaciones, incidencias, disputas y los
fallos registrados por email y push. Si el propio correo falla, el evento queda
visible en `/admin/operaciones` y en los logs del despliegue.

El primer control manual del 4 de septiembre de 2026 autenticó y ejecutó el
cron, pero Resend rechazó el envío. El DNS público de `diime.es` no expone aún
los registros SPF/DKIM de Resend. Antes de dar la alerta por cerrada hay que
verificar un dominio o subdominio de envío en Resend, configurar exactamente ese
dominio en `RESEND_FROM` y repetir el control manual.

## Cierre semanal

- Exportar únicamente métricas agregadas: solicitudes, ofertas, trabajos,
  conversión, tiempo de respuesta y volumen de incidencias.
- Confirmar que no hay eventos P0/P1 abiertos ni fondos en un estado ambiguo.
- Revisar límites y consumo de Supabase, Stripe, Resend, Vercel, FCM y APNs.
- Verificar una restauración o consulta de respaldo según la política del
  proveedor y actualizar este runbook cuando cambie el flujo.
