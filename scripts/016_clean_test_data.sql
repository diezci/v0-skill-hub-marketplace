-- =====================================================
-- SCRIPT DE LIMPIEZA DE DATOS DE PRUEBA
-- =====================================================
-- Este script elimina todos los datos de prueba de la base de datos
-- manteniendo las categorías y la estructura de tablas intacta.

-- 1. Eliminar todos los mensajes
DELETE FROM mensajes;

-- 2. Eliminar todas las conversaciones
DELETE FROM conversaciones;

-- 3. Eliminar evidencias de disputas
DELETE FROM evidencias_disputa;

-- 4. Eliminar disputas
DELETE FROM disputas;

-- 5. Eliminar transacciones escrow
DELETE FROM transacciones_escrow;

-- 6. Eliminar reseñas
DELETE FROM reseñas;

-- 7. Eliminar actualizaciones de trabajo
DELETE FROM actualizaciones_trabajo;

-- 8. Eliminar trabajos
DELETE FROM trabajos;

-- 9. Eliminar ofertas
DELETE FROM ofertas;

-- 10. Eliminar solicitudes
DELETE FROM solicitudes;

-- 11. Eliminar portfolio
DELETE FROM portfolio;

-- 12. Eliminar invitaciones
DELETE FROM invitaciones;

-- 13. Eliminar profesionales (perfiles profesionales)
DELETE FROM profesionales;

-- 14. Eliminar empresas
DELETE FROM empresas;

-- 15. Eliminar perfiles de usuario (esto NO elimina usuarios de auth.users)
DELETE FROM profiles;

-- =====================================================
-- NOTA IMPORTANTE:
-- Los usuarios en auth.users deben eliminarse manualmente 
-- desde el dashboard de Supabase > Authentication > Users
-- ya que no se pueden eliminar con SQL por seguridad.
-- =====================================================

-- Verificar que las categorías siguen intactas
SELECT COUNT(*) as total_categorias FROM categorias;
