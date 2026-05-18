-- Script para limpiar todos los datos de prueba antes de lanzamiento a produccion
-- IMPORTANTE: Este script elimina TODOS los datos de las tablas excepto categorias

-- Desactivar temporalmente los triggers para evitar problemas
ALTER TABLE IF EXISTS mensajes DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS conversaciones DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS ofertas DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS trabajos DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS solicitudes DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS profesionales DISABLE TRIGGER ALL;
ALTER TABLE IF EXISTS profiles DISABLE TRIGGER ALL;

-- Eliminar datos en orden correcto (respetando foreign keys)

-- 1. Evidencias de disputas
DELETE FROM evidencias_disputa;

-- 2. Disputas
DELETE FROM disputas;

-- 3. Transacciones escrow
DELETE FROM transacciones_escrow;

-- 4. Actualizaciones de trabajo
DELETE FROM actualizaciones_trabajo;

-- 5. Resenas
DELETE FROM reseñas;

-- 6. Portfolio
DELETE FROM portfolio;

-- 7. Mensajes
DELETE FROM mensajes;

-- 8. Conversaciones
DELETE FROM conversaciones;

-- 9. Invitaciones
DELETE FROM invitaciones;

-- 10. Trabajos
DELETE FROM trabajos;

-- 11. Ofertas
DELETE FROM ofertas;

-- 12. Solicitudes
DELETE FROM solicitudes;

-- 13. Profesionales
DELETE FROM profesionales;

-- 14. Empresas
DELETE FROM empresas;

-- 15. Profiles (excepto admins si existen)
DELETE FROM profiles WHERE es_admin IS NOT TRUE;

-- Reactivar triggers
ALTER TABLE IF EXISTS mensajes ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS conversaciones ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS ofertas ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS trabajos ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS solicitudes ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS profesionales ENABLE TRIGGER ALL;
ALTER TABLE IF EXISTS profiles ENABLE TRIGGER ALL;

-- Verificar que las categorias siguen existiendo
SELECT COUNT(*) as total_categorias FROM categorias;
