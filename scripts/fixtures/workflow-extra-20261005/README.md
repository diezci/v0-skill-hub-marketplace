# DDL para pruebas locales

Estas dos migraciones se exportaron del historial remoto de Diime en modo lectura durante la revisión del 12 de octubre de 2026. Completan el snapshot local para representar el esquema de empresas existente. Solo contienen DDL, sin datos de usuarios ni secretos.

Los runners `scripts/test-privacidad-workflow.mjs` y `scripts/test-archivos-privados-db.mjs` las aplican en PostgreSQL desechable después de las migraciones anteriores al 12 de octubre. No son nuevas migraciones de producción y no deben enviarse mediante `supabase db push`.

Los runners solo aplican estos exports cuando no existe una migración canónica con el mismo nombre (sin el prefijo de fecha). Así un checkout actualizado de `main` no ejecuta dos veces la misma DDL con timestamps diferentes.
