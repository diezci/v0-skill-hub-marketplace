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

Hacer la retirada en una ventana sin escrituras de usuarios o procesos que puedan volver a introducir URLs antiguas. El script vuelve a leer original y copia privada, comprueba hash/tamaño y ausencia de referencias privadas, y examina las demás columnas de todas las tablas expuestas por la API. La base y Blob no comparten una transacción: la ventana sin escrituras evita que aparezca una nueva referencia entre la comprobación y el borrado.

No se borra un original usado también en `profiles.foto_perfil`, `profiles.foto_portada`, `portfolio.imagenes`, `empresas.logo_url` o cualquier otra columna. En esos casos las referencias privadas se migran, pero la URL antigua continúa siendo pública y necesita revisión individual. Una tabla/vista sin una clave de paginación identificable, una lectura incompleta o un cambio en el número de filas detiene el borrado de ese archivo conservando el original.

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
```

18 escenarios del motor y 8 del adaptador real con SDK/fetch inyectados. Cubren transportes falsos: modo lectura, copia y checksum, interrupciones, duplicados Storage `400`, reanudación con hash, dos flags de borrado, cambios del original, enlaces ajenos, protección de imágenes públicas, Unicode y claves compuestas. No sustituye una ejecución de inventario ni la comprobación de acceso en el entorno desplegado.
