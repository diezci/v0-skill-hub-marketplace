-- Script de prueba simple - crear categoría de ejemplo
INSERT INTO public.categorias (nombre, descripcion, color)
VALUES ('Pintura y Decoración', 'Servicios de pintura interior y exterior', '#3B82F6')
ON CONFLICT (nombre) DO NOTHING;

-- Mensaje de confirmación
SELECT 'Datos de prueba base creados. Los perfiles de usuario deben crearse vía registro/auth en Supabase.' as status;
