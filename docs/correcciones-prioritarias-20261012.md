# Correcciones prioritarias del workflow de Diime

Estado: implementadas y verificadas localmente. No desplegadas ni aplicadas a la base de datos de producción en esta intervención.

## Cambios

| Problema | Corrección |
| --- | --- |
| Reseñas asociadas a un contrato o profesional ajeno | Validación en la base de datos del cliente y proveedor efectivos, contrato completado y permisos actuales. Reseña, vínculo y reputación se confirman juntos; los reintentos no duplican la reseña. Las valoraciones simultáneas de contratos distintos también actualizan la reputación sin interbloqueo. |
| Portfolio con contratos ajenos | Guarda en la base de datos del contrato completado, proveedor y permisos actuales. Los datos del proyecto se toman de su demanda. Se conserva la separación existente entre información pública y precios exactos. |
| Notas privadas legibles por el cliente | Se trasladan sin borrarlas a una tabla privada. La columna contractual compartida queda vacía; lectura y edición requieren autorización vigente del proveedor. |
| Subidas anónimas y adjuntos públicos | Sesión y cuenta activa antes de procesar una subida. Solo las imágenes explícitas de perfil/portfolio siguen públicas. Los adjuntos nuevos van a un bucket privado; cada descarga comprueba acceso actual al mensaje, oferta, solicitud o trabajo. Se impiden vínculos a archivos ajenos y variantes de URL que eludan el control. |
| Reembolsos y cancelaciones bloqueados | Reintento explícito autorizado y auditado por administración para devoluciones fallidas, conservando importes e idempotencia. Los avisos antiguos de Stripe no sustituyen un intento nuevo. Una cancelación ya aceptada puede terminar aunque después se revoque al aceptante, también sin pago previo o entre aceptación e inicio del reembolso; las nuevas autorizaciones siguen comprobando sus permisos. |
| Cierre de sesión aparente | Cinco puntos de salida comprueban que la sesión se ha cerrado antes de navegar. Un fallo informa y permite reintentar. La desvinculación de notificaciones conserva su token hasta confirmarse. |
| Borradores perdidos y conversaciones mezcladas | Estado por conversación, limpieza del borrador solo tras confirmar el envío, recuperación tras errores y descarte de respuestas antiguas al cambiar de conversación o cuenta. |

Los archivos mantienen su nombre y miniatura cuando corresponde. Los PDF se muestran como enlaces, también en el historial de disputas de administración.

## Evidencia

Las reproducciones previas y los resultados posteriores se conservan separados en `.build/correcciones-prioritarias-20261012/`. Los tests usan cuentas sintéticas, PostgreSQL local desechable y transportes controlados para Stripe/Auth/Storage. No son comprobaciones E2E en producción ni mueven dinero real.

Con las dependencias locales de los runners instaladas, `npm run test:workflow:prioritarios` ejecuta el conjunto reproducible de estas correcciones.

| Comprobaciones dirigidas | Superadas |
| --- | ---: |
| Reseñas, portfolio y notas privadas | 43 |
| Permisos de adjuntos en PostgreSQL | 38 |
| Rutas de subida y descarga | 26 |
| Sesión y chat | 31 |
| Presentación de adjuntos | 8 |
| Reembolso terminal, acción admin y webhooks | 20 |
| Recuperación de cancelaciones/reembolsos en PostgreSQL | 12 |
| Migración histórica: motor y adaptador | 26 |
| **Total de comprobaciones dirigidas** | **204** |

Se ejecutan además las regresiones financieras anteriores (incluidos 24 casos SQL), empresas, notificaciones, traducciones y compilación. Estos recuentos corresponden a pruebas locales de las correcciones, no a filas E2E superadas de la matriz original.

La ejecución conjunta terminó con código 0. El registro `workflow-final.log` contiene también siete fallos esperados de la versión anterior, utilizados para demostrar las vulnerabilidades antes de corregirlas; están excluidos del resultado final. `resumen-final.json` recoge los resultados y las huellas de las tres migraciones verificadas.

- Privacidad, reseñas y portfolio: `node scripts/test-privacidad-workflow.mjs`.
- Permisos SQL de archivos y coexistencia de las tres migraciones: `node scripts/test-archivos-privados-db.mjs`.
- Rutas de subida/descarga: `node scripts/test-archivos-privados.mjs`.
- Sesión, errores y concurrencia del chat: `node scripts/test-sesion-chat.mjs`.
- Presentación de adjuntos: `node scripts/test-adjuntos-lista.mjs`.
- Reembolsos y webhooks: `npm run test:reembolsos`; PostgreSQL: `node scripts/test-pagos-recovery-integration.mjs`.
- Traslado de archivos antiguos: `node scripts/test-migrar-adjuntos-privados.mjs` y `node scripts/test-migrar-adjuntos-adapter.mjs`.
- Regresiones adicionales: `npm run test:notificaciones`, `npm run test:empresas:produccion`, traducciones, TypeScript y compilación de producción.

Los runners SQL indican la instalación aislada de Embedded Postgres en sus cabeceras. Las dos DDL auxiliares de octubre están en `scripts/fixtures/workflow-extra-20261005/`; son fixtures, no migraciones nuevas de producción.

En la aplicación compilada y servida localmente, subir o descargar un adjunto sin sesión responde HTTP 401. Un identificador inválido responde 404 y las descargas usan `private, no-store`.

## Aplicación a producción

La publicación requiere coordinar código y las tres migraciones, respetando sus dependencias previas:

1. `20261012204814_recuperar_reembolsos_y_cierre_cancelacion.sql`.
2. `20261012204846_integridad_resenas_portfolio_notas_privadas.sql`.
3. `20261012204908_proteger_adjuntos_privados.sql`.

Después de aplicar las migraciones, desplegar el código y verificar sesiones reales de cliente, proveedor y administración, ejecutar el inventario de adjuntos históricos con `scripts/migrar-adjuntos-privados.mjs`. Su modo predeterminado solo lee. La copia, verificación de contenido, sustitución de referencias y retirada de originales son operaciones explícitas y reanudables, documentadas en [la guía de migración](migracion-adjuntos-historicos.md).

**Los enlaces históricos de Blob continúan públicos hasta trasladarlos y retirar sus originales.** Crear el bucket privado no modifica esos enlaces. Un archivo que también sea una imagen pública, una referencia externa no controlada o una copia que no se pueda verificar debe quedar identificado en el informe de migración; no debe presentarse como protegido o borrado.

El traslado conserva imágenes públicas utilizadas por perfiles/portfolio y otras referencias encontradas. El borrado de originales exige su opción específica y una copia privada comprobada. Se debe revisar cualquier resultado retenido, bloqueado o incompleto antes de cerrar la incidencia de producción.

## Límites

- Los borradores del chat se conservan al cambiar de conversación y ante errores de envío; se limpian al cambiar de cuenta. No se añade persistencia tras cerrar o recargar la página.
- Las solicitudes abiertas mantienen su visibilidad para usuarios registrados; sus documentos ya no se descargan anónimamente. Los contratos, ofertas y chats mantienen sus permisos correspondientes.
- Los cambios no certifican las 1.660 comprobaciones de la matriz como E2E superadas ni corrigen automáticamente todos los demás hallazgos de aquella auditoría.
- Los asesores locales mantienen advertencias anteriores en funciones/políticas no modificadas; no se interpretan como una certificación completa de seguridad del proyecto.
