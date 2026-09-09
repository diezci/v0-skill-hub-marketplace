# Pruebas de integridad del workflow

Estas pruebas no usan el proyecto Supabase ni llaman a Stripe. Ejecutan PostgreSQL 17 local con tablas, restricciones, funciones, índices, políticas y permisos de columna obtenidos mediante consultas de solo lectura el 9 de septiembre de 2026. El fixture contiene estructura, sin filas de producción. Las tablas de `auth` son una compatibilidad mínima para probar los roles y los procedimientos. No sustituye el ensayo del servicio Auth, las pantallas ni Stripe de pruebas.

Instalación aislada, sin cambiar las dependencias de la aplicación:

```sh
npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
node scripts/test-workflow-integration.mjs
node scripts/test-permisos-workflow.mjs
node scripts/test-stripe-recuperacion.mjs
pnpm test:comisiones
pnpm test:notificaciones
pnpm build
```

El ejecutor levanta un servidor nuevo en `127.0.0.1:55441`, lo cierra al terminar y guarda el resultado en `.build/workflow-integration-results.json`. `DIIME_WORKFLOW_TEST_PORT` permite usar otro puerto local libre. Las suites rechazan direcciones remotas. Los casos de concurrencia usan conexiones independientes y comprueban cuál de las operaciones ganó.

La primera base parte del esquema previo para probar la migración histórica de comisiones. La segunda aplica conjuntamente las migraciones pendientes y prueba permisos, contratación, baja y flujos económicos. Todos los participantes, empresas, contratos e identificadores de Stripe son sintéticos.

## Cobertura y límites

- Comisiones: evidencia del 5 % y 10 %, mínimos coincidentes, tarifa desconocida, aceptación expresa y conservación íntegra de los registros económicos anteriores.
- Permisos: mensajes y lectura, notificaciones, invitaciones, pertenencia a empresa, cobros particulares y de empresa y respuestas de Stripe que llegan después de cambiar la entidad.
- Contratación: aceptación repetida, ofertas rivales simultáneas, enlaces falsos, estados protegidos, proveedor frente a compañero de empresa, progreso y entrega, baja con obligaciones y carrera baja/aceptación.
- Dinero: expiración, pago tardío, disputa sobre el intento realmente cobrado, cancelación, mediación sin pago, decisiones concurrentes, contracargos y reintentos después de una interrupción.
- Recuperación de Stripe: dependencias simuladas para provocar reembolso pendiente, fallo de transferencia, fallo de base de datos después del movimiento y reintentos sin duplicar movimientos.

El control completo de tipos se ejecuta por separado. El proyecto ya tenía errores de tipos y la configuración de compilación omite ese control; un build correcto no significa que TypeScript esté limpio.

Para el ensayo de interfaz se necesitan sesiones separadas de cliente particular, cliente empresa, proveedor particular, representante de empresa, empleado invitado, administrador y usuario ajeno. Se deben repetir los recorridos comunes con ambos tipos de proveedor y conservar evidencia de ambas ejecuciones. Cada desenlace económico requiere un contrato independiente en Stripe de pruebas.

## Publicación

Estas correcciones requieren publicar la aplicación y aplicar las migraciones coordinadamente. Endurecer los permisos antes de cambiar las acciones antiguas puede bloquear temporalmente esas acciones. No ejecutar de forma indiscriminada todas las migraciones antiguas: el historial remoto no refleja necesariamente los cambios de esquema aplicados anteriormente.

Antes de publicar, ejecutar `scripts/preflight-contratacion.sql` y revisar los casos. Nunca borrar pagos ni decidir automáticamente sobre un historial ambiguo. La migración de comisión no modifica escrows y conserva como desconocido cualquier acuerdo sin evidencia suficiente. Los duplicados históricos se conservan salvo la reparación específica de una copia pendiente sin ningún intento de pago que tiene un hermano idéntico ya completado.

Después de publicar, verificar versión local, GitHub y versión servida por Diime, presencia de campos y funciones, permisos efectivos y recorrido autenticado. Una respuesta HTTP correcta o una subida a GitHub no valida el flujo económico.
