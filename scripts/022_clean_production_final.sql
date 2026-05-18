-- Script para limpiar todos los datos de prueba de la base de datos
-- Preparacion para lanzamiento a produccion
-- Ejecutar en orden para respetar foreign keys

-- 1. Eliminar mensajes
DELETE FROM mensajes;

-- 2. Eliminar conversaciones
DELETE FROM conversaciones;

-- 3. Eliminar evidencias de disputas
DELETE FROM evidencias_disputa;

-- 4. Eliminar disputas
DELETE FROM disputas;

-- 5. Eliminar transacciones escrow
DELETE FROM transacciones_escrow;

-- 6. Eliminar resenas
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

-- 13. Eliminar profesionales (excepto admins)
DELETE FROM profesionales 
WHERE id IN (
  SELECT id FROM profiles WHERE es_admin IS NOT TRUE
);

-- 14. Eliminar empresas
DELETE FROM empresas;

-- 15. Eliminar perfiles (excepto admins)
DELETE FROM profiles WHERE es_admin IS NOT TRUE;

-- Mantener categorias intactas
-- Las categorias son datos de referencia necesarios para el funcionamiento
