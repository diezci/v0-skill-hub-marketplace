# Pagos por hitos

Implementación en la rama `codex/pagos-hitos`. Mantiene el pago único y añade un plan de pagos versionado al mismo trabajo. No se ha publicado ni se han aplicado estas migraciones a una base de datos alojada.

## Comportamiento

- Al publicar una solicitud se puede elegir pago único o proponer hitos. En la solicitud, los importes, fechas y criterios pueden quedar por definir.
- El proveedor puede presupuestar con pago único o con entre 2 y 20 hitos. Un plan contractual requiere título, importe, fecha y criterio verificable de aceptación para cada hito. La suma debe coincidir con el precio del presupuesto.
- Cliente y proveedor pueden añadir, quitar, ordenar y modificar los hitos antes de contratar. Una contrapropuesta sustituye la versión pendiente y requiere la aceptación de la otra parte. Contratar exige confirmar expresamente la versión revisada.
- Después de contratar, cualquiera de las partes puede proponer cambios sobre los hitos pendientes. Se conserva el total contratado: añadir o quitar hitos redistribuye el importe pendiente, sin cambiar el precio total. El cambio solo se aplica cuando la otra parte acepta esa versión.
- Los hitos pagados o con un intento de pago abierto conservan su importe, orden, condiciones y trazabilidad. El cliente puede cerrar un intento todavía no pagado para permitir una nueva propuesta. Si el pago ya se ha realizado o está procesándose, primero debe conciliarse.
- Solo se cobra el siguiente hito disponible. El proveedor entrega el resultado y las evidencias; el cliente comprueba los criterios y aprueba la liquidación o solicita cambios. Aprobar un hito no completa por sí solo todo el trabajo.
- Las discrepancias se tramitan sobre el pago del hito correspondiente. Las cancelaciones conservan lo ya liquidado y afectan al trabajo pendiente. Una mediación entre dos hitos, sin un pago activo, no modifica pagos históricos.
- La pantalla del trabajo mantiene un hilo vertical entre hitos. El resumen distingue el servicio aprobado, el importe financiado pendiente de aprobación y los hitos aún sin pagar. El justificante separa cada pago y no expone las comisiones de la otra parte.

La certificación implementada es la aprobación expresa del cliente sobre los criterios y evidencias de cada hito; no incorpora un certificador externo.

## Integración

El contrato sigue siendo `trabajos`. Las tablas `trabajos_hitos`, `trabajos_planes_hitos` y `ofertas_planes_hitos` conservan los hitos y las propuestas versionadas. `transacciones_escrow.hito_id` vincula cada intento de pago con su hito; queda nulo en el pago único.

Las operaciones de lectura y negociación utilizan funciones con comprobación de identidad, parte, permisos empresariales y versión. Las tablas internas no se exponen directamente al cliente. Los importes se validan en céntimos y las comisiones del contrato se reparten una sola vez, conservando los céntimos y las condiciones históricas del proveedor.

Cada hito utiliza Checkout y el circuito existente de cargos separados y transferencias. Los metadatos identifican contrato, hito e intento de pago; las claves de idempotencia y la reserva persistente permiten recuperar interrupciones sin duplicar el movimiento. Los webhooks, la aprobación, los reembolsos, las reclamaciones bancarias y la conciliación trabajan sobre el pago identificado. Los hitos futuros no se consideran financiados.

El importe contractual mínimo del servicio es 0,50 € por hito. El cobro, incluida la comisión del cliente, debe respetar el límite de importe de Stripe en EUR. Referencias: [límites de importe](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts) y [cargos separados y transferencias](https://docs.stripe.com/connect/separate-charges-and-transfers).

La web y la app comparten los formularios y el seguimiento: `capacitor.config.ts` carga el sitio alojado. La comprobación responsive en navegador no equivale a una prueba en un dispositivo iOS o Android.

## Migraciones y puesta en servicio

Aplicar en orden, después de todas las migraciones anteriores del repositorio:

1. `supabase/migrations/20261111235115_pagos_hitos_planes.sql`
2. `supabase/migrations/20261111235133_hitos_conciliacion_financiera.sql`

Las migraciones y el código forman una misma entrega. La nueva versión necesita las columnas y funciones de ambas migraciones. Conservar las funciones que despachan los contratos de pago único y el historial de pagos; no eliminar tablas para revertir una interfaz.

Antes de activar el flujo con dinero real, validar en un entorno aislado con Stripe de pruebas: contratación, pago con autenticación adicional, entrega con archivos, aprobación, siguiente hito, cambios por ambas partes, reembolso y webhook repetido. Validar también la vuelta al pago, la sesión, los adjuntos y las notificaciones en iOS y Android. Estas comprobaciones externas todavía no se han realizado.

## Verificación local reproducible

Pruebas de dominio, acciones, UI, Stripe simulado y justificantes:

```sh
pnpm test:hitos
pnpm typecheck
pnpm build
```

Pruebas SQL en una base efímera local, sin conectarse a Supabase alojado:

```sh
npm install --prefix /tmp/diime-hitos-db-tests --no-save --no-package-lock @electric-sql/pglite@0.3.14
PGLITE_PATH=/tmp/diime-hitos-db-tests/node_modules/@electric-sql/pglite/dist/index.js pnpm test:hitos:db
```

Pruebas con sesiones simultáneas en PostgreSQL nativo efímero:

```sh
npm install --prefix /tmp/diime-hitos-native --no-save --no-package-lock embedded-postgres@17.6.0-beta.15 pg@8.23.0
DIIME_TEST_NODE_MODULES=/tmp/diime-hitos-native/node_modules node supabase/tests/hitos-concurrencia.test.mjs
```

El adaptador nativo usa exclusivamente `127.0.0.1:55449`, crea un directorio temporal y lo elimina al terminar. No ejecutar dos suites nativas a la vez sobre ese puerto. También permite ejecutar las suites de planes y finanzas sustituyendo `PGLITE_PATH` por la ruta absoluta de `supabase/tests/fixtures/hitos-native-db.mjs` y definiendo `DIIME_TEST_NODE_MODULES`.

La cobertura incluye permisos personales y empresariales, versiones obsoletas, cambios de planes, conservación de hitos financiados, reparto de comisiones, intentos duplicados, recuperación de transferencias, reembolsos y sus fallos tardíos, cancelaciones, mediación, reclamaciones bancarias y privacidad de justificantes. Las simulaciones de Stripe no realizan cargos ni envían mensajes reales.

Comprobado localmente el 12 de noviembre de 2026: compilación de producción, comprobación completa de tipos, 30 pruebas de la suite `test:hitos` (incluye además ocho escenarios de Stripe simulado), 51 comprobaciones SQL de planes y permisos, 15 escenarios SQL financieros, 15 pruebas de justificantes/IVA existentes, autenticación y borradores de los formularios, traducciones y recuperación financiera existente. La revisión visual cubrió escritorio y anchos móviles de 390 y 320 píxeles, sin desbordamiento horizontal.

La fixture SQL ejecuta las funciones reales relevantes del repositorio sobre un esquema sintético, incluidas sus modificaciones posteriores. No equivale a un restablecimiento integral de Supabase, Storage y autenticación ni valida el estado de una base de datos alojada. Las pruebas nativas comprueban, con conexiones simultáneas, la aceptación duplicada, la preparación duplicada del mismo pago y la competencia entre preparar un pago y proponer cambios.

## Vista previa

`/preview/hitos` solo existe en desarrollo y devuelve 404 en producción. Utiliza los componentes reales con datos ficticios y permite revisar el seguimiento, la publicación de la solicitud y la respuesta del proveedor sin publicar ni realizar pagos.

Las capturas de `docs/hitos/` documentan esta vista de ejemplo, no un contrato real ni un pago procesado.
