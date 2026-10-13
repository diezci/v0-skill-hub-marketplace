# Verificación de las tres migraciones prioritarias

Las consultas `scripts/verify-workflow-prioritarios-pre.sql` y `scripts/verify-workflow-prioritarios-post.sql` son de solo lectura. Devuelven conteos, permisos, definiciones de guardas y huellas agregadas; no muestran nombres, correos, IDs de personas/contratos, textos de notas, comentarios de reseñas ni URLs de archivos.

Ejecutar la consulta previa antes de aplicar las tres migraciones y guardar su resultado. Ejecutar la posterior inmediatamente después y otra vez tras migrar los adjuntos antiguos. No ejecutar la consulta posterior antes de crear sus tablas y funciones. Los cambios concurrentes de usuarios deben tenerse en cuenta al comparar conteos.

## Referencia capturada antes del despliegue

Lectura del 13 de octubre de 2026 a las 18:29:08 UTC, proyecto `ndzpkwdkbnxaedsouwzx`:

| Elemento | Antes |
| --- | ---: |
| Trabajos | 25 |
| Solicitudes | 36 |
| Ofertas | 30 |
| Reseñas | 6 |
| Portfolio | 4 |
| Notas no NULL | 2 |
| Bytes de notas | 0 |
| Grupos de reseñas duplicadas por contrato | 0 |
| Reseñas con proveedor equivocado | 0 |
| Reseñas de trabajo no completado | 0 |
| Reseñas cuyo vínculo `review_cliente_id` no coincide | 1 |
| Portfolio con proveedor equivocado o trabajo no completado | 0 |

La huella agregada de notas fue `4a06f5b372399d73d2d673845eabb723`. Las dos notas existentes son cadenas vacías y deben conservarse como dos filas privadas; no debe confundirse cero bytes con cero filas.

La reseña con vínculo no coincidente es anterior a esta intervención. La migración conserva la historia: no la corrige, borra ni duplica. Un resultado posterior de una anomalía histórica no es una regresión. Las reseñas nuevas de versión 2 deben cumplir todas las guardas.

## Criterios de aceptación

1. **Conservación:** sin escrituras concurrentes, los cinco conteos principales permanecen iguales. Las notas privadas conservan filas, bytes y huella; `notes_shared_nonnull` debe ser cero. La restricción `trabajos_notas_solo_privadas` debe existir y estar validada.
2. **Acceso:** las tres tablas privadas tienen RLS habilitado y no conceden SELECT/INSERT/UPDATE/DELETE a `authenticated` ni SELECT a `anon`. Las RPC públicas de reseñas/notas permiten únicamente su acceso autenticado previsto; las financieras y la migración de referencias no conceden EXECUTE a `anon`/`authenticated`.
3. **Reseñas:** se conservan las seis filas históricas salvo actividad legítima posterior. El índice nuevo es único, válido, listo y limitado a `integridad_version=2`; el valor predeterminado es 2. `new_integrity_violations` debe ser cero y no deben crecer los grupos duplicados. La anomalía histórica de vínculo se contrasta con la referencia anterior.
4. **Portfolio:** no deben crecer las anomalías de proveedor/estado. La guarda `validar_portfolio_trabajo` debe estar habilitada y tener la definición verificada.
5. **Funciones y triggers:** comparar las 39 firmas y huellas con `local-catalog-after.json`; los 10 triggers nuevos deben estar habilitados. Si una huella difiere, inspeccionar el DDL antes de dar la verificación por terminada. La comparación de privilegios de usuarios debe incluir siempre `anon` y `authenticated`; los privilegios por defecto de `service_role` pueden diferir del PostgreSQL mínimo de pruebas.
6. **Adjuntos nuevos:** bucket `adjuntos-privados` con `public=false`, límite de 10 MiB y política restrictiva. `route_references_without_metadata` debe ser cero.
7. **Históricos:** después de convertirlos, `legacy_without_hash`, `legacy_unshared` y `legacy_private_references_remaining` deben ser cero para los archivos convertidos. Los conteos de Blob solo identifican referencias privadas restantes: el inventario de Storage/Blob y su informe operativo son los que prueban la copia y retirada de cada original. Una referencia también usada como imagen pública o una URL ajena necesita su estado explícito; SQL no demuestra que el original se haya borrado.

Los cambios no incluyen escrituras de prueba en producción. La comprobación SQL no sustituye las descargas reales con sesiones legítimas y ajenas, ni demuestra Auth, Stripe o almacenamiento externo.

## Comparación independiente de dependencias

Antes de aplicar los cambios se reconstruyó el esquema local previo, incluidas las dos DDL remotas de octubre. Las 14 funciones que las migraciones reemplazan, parchean o usan para permisos tienen huellas de definición idénticas en producción y en ese esquema local. Ambos puntos de inserción del parche de adjuntos existen.

La única diferencia de privilegio detectada es EXECUTE para `service_role` en el wrapper público `empresa_puede_operar_trabajo(uuid,text,text)`, que está concedido en producción y no en el fixture mínimo. No amplía el acceso de `anon`/`authenticated` y no impide estas migraciones.

Las tres huellas SHA-256 coinciden con el informe local aprobado `resumen-final.json`. No se detectó deriva de DDL peligrosa en las dependencias examinadas. Esto no equivale a revisar todo el esquema ni todos los cambios históricos.

Evidencia local (directorio ignorado): `.build/correcciones-prioritarias-20261012/privacidad/production-before.json`, `production-drift.json`, `local-catalog-before.json`, `local-catalog-after.json` y `catalog-compare.log`. Las consultas post se ejecutaron correctamente contra PostgreSQL desechable con las tres migraciones; todavía requieren su lectura posterior en producción.

## Ensayo de permisos con rollback

`scripts/verify-workflow-prioritarios-rollback.template.sql` prepara 31 aserciones con las políticas, triggers y RPC reales. Debe ejecutarse únicamente después de aplicar las tres migraciones y de revisar el archivo generado. El preparador `node scripts/prepare-workflow-prioritarios-rollback.mjs` lee solo alias e IDs de `.build/qa-ui-credentials.json`, sustituye los marcadores y escribe `.build/correcciones-prioritarias-20261012/privacidad/production-rollback.sql`. No conecta a ninguna base ni copia contraseñas, tokens o sesiones.

Las comprobaciones usan CP/PP/AJ QA actuales para contratos particulares y lectura de permisos empresariales actuales de CE/EP/AJ. Las empresas QA existentes están sin verificar. Para no modificar su verificación ni sus afiliaciones, se crean tres identidades y dos empresas enteramente sintéticas dentro de una subtransacción, copiando los permisos empresariales actuales de CE/PE/EP. Los contratos empresariales sintéticos comprueban titular, delegado y cliente. Se cambian solo los claims SQL durante cada aserción; no se emiten tokens ni se inicia una sesión Auth real.

El bloque fuerza una excepción controlada después de las aserciones para revertir toda la subtransacción. Una excepción imprevista también revierte las fixtures y deja un resultado fallido. El SELECT devuelve los resultados después de la reversión. Se exige `setup_completed=true`, `checks_count=31`, `all_checks_pass=true`, `qa_reputation_unchanged=true`, `qa_profiles_memberships_companies_unchanged=true` y cero en cada contador `*_after_rollback`. No se ejecutan llamadas Auth API, Stripe, Storage ni RPC de notificaciones. Los triggers remotos de las tablas de identidad y empresa examinados solo hacen operaciones SQL transaccionales; los helpers se crean únicamente en `pg_temp`.

Reproducción local independiente, sin credenciales ni conexión a Supabase:

```sh
npm install --prefix .build/workflow-db embedded-postgres@17.6.0-beta.15 pg@8.23.0
node scripts/test-workflow-prioritarios-rollback.mjs
```

El runner inicia PostgreSQL desechable en `127.0.0.1:55548`, restaura el esquema versionado, ambas DDL remotas auxiliares y las tres migraciones. Comprueba también que el trigger `auth.users` cree el perfil como en Supabase. La evidencia se guarda en `.build/correcciones-prioritarias-20261012/privacidad/rollback-local-result.json`. Este ensayo prueba autorización en la base, no la interfaz ni los servicios externos. Su preparación y prueba local no significan que se haya ejecutado en producción.
