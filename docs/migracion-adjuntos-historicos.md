# Trasladar adjuntos históricos a almacenamiento privado

`scripts/migrar-adjuntos-privados.mjs` copia los adjuntos antiguos de Vercel Blob a Supabase Storage y sustituye sus referencias. **No se ha ejecutado contra producción.** El cambio de las nuevas subidas por sí solo no retira los originales públicos históricos.

## Preparación

La base debe tener la migración `20261012204908_proteger_adjuntos_privados.sql`, incluida la columna `sha256`, el bucket `adjuntos-privados` con `public=false` y la función `migrar_referencia_archivo_privado`. El servidor desplegado debe servir `/api/archivos/{id}?nombre=...` con sus comprobaciones de acceso.

El entorno necesita `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` y `BLOB_READ_WRITE_TOKEN`. Usar el token del almacén Blob que contiene los originales. No copiar los valores en informes o terminales compartidos. El script exige `--project-ref` y comprueba que coincide con el host de Supabase, además de la clave de proyecto cuando es un JWT. `NEXT_PUBLIC_SITE_URL` debe ser un origen HTTPS sin ruta adicional.

El inventario se obtiene con el token de Blob. Solo se descargan URLs exactas de ese inventario en el dominio público de Blob; no se siguen redirecciones. Una URL arbitraria guardada en un mensaje o cuestionario nunca se usa como destino de descarga.

## Ejecución

Sustituir `PROJECT_REF` por el identificador esperado del proyecto y usar un archivo de entorno controlado. Por defecto solo se hacen lecturas:

```sh
node --env-file=.env.local scripts/migrar-adjuntos-privados.mjs --project-ref PROJECT_REF --report .build/adjuntos-inventario.json
```

Revisar el inventario. Para copiar y actualizar las referencias, conservando todavía los originales:

```sh
node --env-file=.env.local scripts/migrar-adjuntos-privados.mjs --project-ref PROJECT_REF --apply --report .build/adjuntos-copia.json
```

La copia privada se descarga de nuevo y se compara por SHA-256 y tamaño antes de guardar metadata o sustituir referencias. Cada registro guarda `legacy_url`, hash, nombre, tamaño, `propietario_id=null` y `compartido=true`. El identificador y la ruta son deterministas; una interrupción se reanuda sin sobrescribir el archivo. La sustitución de referencias se hace atómicamente mediante la función de base de datos.

Validar después el acceso desde cuentas participantes y ajenas. Para retirar los originales públicos se exige además un segundo flag:

```sh
node --env-file=.env.local scripts/migrar-adjuntos-privados.mjs --project-ref PROJECT_REF --apply --delete-public-originals --report .build/adjuntos-retirada.json
```

Hacer la retirada en una ventana que impida introducir las URLs antiguas. Para mantener el resto de la aplicación disponible, usar la protección SQL selectiva explicada debajo. El script vuelve a leer original y copia privada, comprueba hash/tamaño y ausencia de referencias privadas, y examina las demás columnas de todas las tablas expuestas por la API. El borrado utiliza `ifMatch` con el ETag fuerte de la última descarga verificada; si falta el ETag, es débil o cambia el original, no se borra. La base y Blob no comparten una transacción.

No se borra un original usado también en `profiles.foto_perfil`, `profiles.foto_portada`, `portfolio.imagenes`, `empresas.logo` o cualquier otra columna. En esos casos las referencias privadas se migran, pero la URL antigua continúa siendo pública y necesita revisión individual. Una tabla/vista sin una clave de paginación identificable, una lectura incompleta o un cambio en el número de filas detiene el borrado de ese archivo conservando el original.

## Ventana selectiva y fotografías públicas compartidas

Los scripts de `scripts/ops/` son operaciones explícitas, no migraciones automáticas. No ejecutarlos al arrancar la aplicación. Orden obligatorio:

1. Migraciones y API privada desplegadas; ejecutar la copia privada con `--apply` **sin borrar**. Confirmar metadata, SHA-256, tamaño y acceso de los participantes.
2. Ejecutar `activar-guard-adjuntos-legacy.sql` como operador de base de datos. Obtiene las URLs de metadata verificada, sin hardcodearlas; protege todas las tablas públicas excepto metadata. Bloquea nuevas apariciones de estas URLs en cualquier columna, incluidos JSON, arrays, roles autenticados, servicio y cron. Permite reemplazos y otras escrituras normales. Transacciones con aislamiento REPEATABLE READ/SERIALIZABLE deben reintentarse en READ COMMITTED durante esta ventana. Si la instalación falla por locks o inventario vacío, su transacción revierte.
3. Si una imagen tiene uso público intencional revisado en portfolio, preparar un manifiesto local con filas `{ "portfolioId": "UUID", "sourceHash": "SHA256 de la URL original" }`. Ejecutar primero en lectura `node --env-file=ENV scripts/ops/copiar-imagenes-publicas-legacy.mjs --project-ref PROJECT_REF --manifest MANIFEST --report REPORT`; añadir `--apply` para copiar. Exige la copia privada previa, comprueba firma PNG y SHA-256 de privado/original/público, crea una ruta pública determinista `perfiles/public/legacy-HASH.png` sin sobrescribir y cambia **solo** `portfolio.imagenes` mediante comparación y actualización del array completo. Una edición concurrente cancela el cambio; reintentar vuelve a leer. Nunca borra originales ni publica otros adjuntos. El manifiesto es una autorización específica de imágenes ya públicas, no una clasificación automática.
4. Ejecutar `comprobar-cero-referencias-legacy.sql` y exigir éxito. Comprueba inventario no vacío, cobertura de metadata, triggers activos y cero referencias en todas las filas de todas las tablas públicas, sin paginación. **No basta la lectura paginada del migrador**: borrar e insertar filas entre páginas podría mantener el conteo y omitir una referencia. Una vez demostrado cero, el guard evita nuevas apariciones hasta terminar la retirada. No crear tablas nuevas ni desactivar triggers durante la ventana.
5. Solo entonces ejecutar `migrar-adjuntos-privados.mjs --apply --delete-public-originals ...`. Conservar el guard activo hasta verificar inventario Blob, respuestas de las URLs antiguas, acceso privado y las imágenes públicas nuevas.
6. Ejecutar `desactivar-guard-adjuntos-legacy.sql` y comprobar que retiró únicamente el guard operativo. No dejar la restricción temporal de aislamiento instalada indefinidamente. Un formulario antiguo que guarde después una URL pública retirada puede producir una imagen rota; ya no vuelve público el archivo borrado.

Si falla cualquier comprobación antes de borrar, conservar originales, resolver o abandonar retirando el guard. Si ya hubo borrados, registrar cuáles: retirar el guard **no restaura** archivos. La reanudación verifica las copias y procesa solo lo pendiente; no volver a publicar automáticamente un original privado para hacer rollback.

## Resultados y reanudación

- `references_migrated_original_retained`: copia verificada y referencias cambiadas; falta retirar el original si corresponde.
- `migrated_original_deleted`: se verificó y se retiró el original en esta ejecución.
- `retained_public_or_other_reference` / `retained_private_references_remain`: el original permanece; revisar referencias antes de repetir.
- `already_migrated_source_not_listed` / `references_migrated_source_not_listed`: el original no figura en el inventario; la copia se comprobó contra el hash y tamaño guardados y se conciliaron las referencias. Esto no demuestra que el original se haya borrado: también puede indicar otro almacén/token.
- `skipped_not_owned_or_missing` / `skipped_size`: no se toca el archivo; requiere revisión.
- `error_original_retained`: la operación se detuvo sin solicitar borrado; código de salida 1. Si la fuente no está listada y falta su hash guardado, no se presupone que la copia sea correcta.

Los informes incluyen hashes de las URLs y los IDs privados, nunca las URLs originales, credenciales o contenidos. Guardarlos en un directorio controlado. Repetir la misma orden es seguro: las filas con `legacy_url` siguen siendo candidatas aunque ya no queden referencias antiguas.

## Pruebas locales

```sh
node scripts/test-migrar-adjuntos-privados.mjs
node scripts/test-migrar-adjuntos-adapter.mjs
node scripts/test-copiar-imagenes-publicas-legacy.mjs
node scripts/test-guard-adjuntos-legacy.mjs
```

18 escenarios del motor, 9 del adaptador real con SDK/fetch inyectados, 15 de las copias públicas y 13 grupos del guard en PostgreSQL aislado. Cubren modo lectura, copia y checksum, interrupciones, duplicados Storage `400`, reanudación con hash, dos flags de borrado, ETag condicional, cambios del original, enlaces ajenos, protección de imágenes públicas, Unicode, claves compuestas y escrituras concurrentes. No sustituyen el inventario ni la comprobación de acceso en el entorno desplegado.
