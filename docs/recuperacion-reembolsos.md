# Recuperación de reembolsos y cancelaciones

Cambios locales para PAY-02 y PAY-05. Requieren aplicar la migración `20261012204814_recuperar_reembolsos_y_cierre_cancelacion.sql` y desplegar el código juntos. Este trabajo no ha aplicado migraciones ni movido dinero en producción.

## Reembolso fallido

En Administración → Pagos, abrir el detalle y pulsar **Comprobar reembolso**. Si Stripe confirma `failed` o `canceled`, aparece **Autorizar un nuevo intento de reembolso**. Revisar antes la causa en Stripe: algunos fallos necesitan una vía alternativa para devolver el dinero. Un contracargo bloquea este botón y también se verifica en el servidor.

La autorización guarda administrador, causa, fecha y Refund anterior en `diime_private.reintentos_reembolso`. Dos administradores que actúen a la vez comparten el mismo intento. Se conservan el reparto económico y la operación original; Stripe recibe una clave estable vinculada al Refund anterior. Un nuevo intento que vuelve a fallar requiere otra autorización explícita. Los reintentos ordinarios y los webhooks no crean automáticamente más reembolsos.

Los estados pendientes/fallidos conservan su ID. Un webhook antiguo no puede sustituir el ID del intento nuevo. No se liquida al proveedor antes de que la devolución necesaria esté confirmada. El código tampoco registra como completada una devolución realizada fuera de Stripe: cualquier vía alternativa sigue necesitando conciliación específica.

## Cancelación aceptada antes de una revocación

La aceptación y el actor quedan fijados antes de reclamar la liquidación. Una revocación posterior de ese miembro ya no impide cerrar la cancelación después de confirmar el reembolso. La llamada pública repetida y el cierre sin ningún pago también conservan la aceptación ya fijada; un actor ajeno sigue siendo rechazado. La continuación de servicio también puede reclamar el reembolso después de esa aceptación si el actor es exactamente el aceptante guardado. Una revocación anterior a la aceptación sigue impidiendo aceptar/reclamar; tampoco puede cerrarse mientras queden pagos por conciliar. El actor histórico y el destino económico permanecen intactos.

## Pruebas reproducibles

Desde la raíz del repositorio:

```sh
npm run test:reembolsos
npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
DIIME_WORKFLOW_TEST_PORT=55541 node scripts/test-pagos-recovery-integration.mjs
```

El segundo runner crea y elimina un PostgreSQL local, carga el snapshot de septiembre y todas las migraciones posteriores del checkout. Ejecuta 12 grupos de regresión nuevos y los 24 escenarios financieros existentes. Puede añadirse `DIIME_RUN_ADVISORS=1` para consultar los asesores de Supabase por la conexión local; su salida queda aparte en `local-advisors.log` porque el fixture no es una instalación completa de Supabase.

El conjunto nuevo incluye 8 pruebas de recuperación Stripe, 8 de la acción administrativa y 4 del webhook con firmas reales generadas localmente por el SDK. El transporte Stripe y el almacenamiento del webhook están simulados; no son pruebas E2E contra Stripe test. PostgreSQL usa membresías, bloqueos, funciones y permisos reales, con tablas mínimas que representan Auth/Storage; no comprueba GoTrue, PostgREST ni el API de Storage.

La evidencia anterior al cambio está en `.build/correcciones-prioritarias-20261012/pagos/`: el helper fallaba 4 de las 8 regresiones y el cierre tras revocación producía SQLSTATE `42501`. Las pruebas actuales conservan las mismas expectativas. No se han modificado los resultados de la auditoría inicial.

Para reproducir la ventana aceptación → primer claim anterior al cambio, ejecutar el runner con `DIIME_RECOVERY_BASELINE=claim`: solo en la base local desechable restaura el cuerpo antiguo de esa función y se espera que la regresión falle con `42501`. La firma completa continúa denegando EXECUTE a `anon` y `authenticated` en el esquema actual.
