-- Script para crear 2 usuarios de prueba: un proveedor y un cliente
-- IMPORTANTE: Estos usuarios deben registrarse manualmente en la app con estos datos

-- Para que este script funcione, los usuarios DEBEN registrarse primero vía la UI de registro
-- Después de registrarse, ejecuta este script para actualizar sus perfiles

-- USUARIO 1: PROVEEDOR (Carlos Martínez - Pintor Profesional)
-- Email: carlos.pintor@skillhub.com
-- Contraseña: SkillHub2024!

-- USUARIO 2: CLIENTE (María González)
-- Email: maria.cliente@skillhub.com  
-- Contraseña: SkillHub2024!

-- Este script actualiza los perfiles DESPUÉS del registro
DO $$
DECLARE
  proveedor_id UUID;
  cliente_id UUID;
  categoria_pintura UUID;
BEGIN

-- Buscar el ID del proveedor por email
SELECT id INTO proveedor_id FROM auth.users WHERE email = 'carlos.pintor@skillhub.com';

-- Buscar el ID del cliente por email  
SELECT id INTO cliente_id FROM auth.users WHERE email = 'maria.cliente@skillhub.com';

-- Verificar que los usuarios existen
IF proveedor_id IS NULL THEN
  RAISE EXCEPTION 'Usuario proveedor no encontrado. Por favor regístrate primero con email: carlos.pintor@skillhub.com';
END IF;

IF cliente_id IS NULL THEN
  RAISE EXCEPTION 'Usuario cliente no encontrado. Por favor regístrate primero con email: maria.cliente@skillhub.com';
END IF;

-- Actualizar perfil del PROVEEDOR
UPDATE public.profiles SET
  nombre = 'Carlos',
  apellido = 'Martínez',
  bio = 'Pintor profesional con más de 12 años de experiencia en pintura interior, exterior y decorativa. Especializado en acabados de alta calidad y restauración de fachadas. Trabajo con las mejores marcas de pintura y ofrezco garantía en todos mis trabajos.',
  ubicacion = 'Madrid',
  telefono = '+34 612 345 678',
  foto_perfil = '/professional-man.png',
  verificado = true,
  tipo_usuario = 'proveedor',
  updated_at = NOW()
WHERE id = proveedor_id;

-- Crear perfil profesional del PROVEEDOR
INSERT INTO public.profesionales (id, titulo, tarifa_por_hora, años_experiencia, disponible, habilidades, certificaciones, idiomas, created_at, updated_at)
VALUES (
  proveedor_id,
  'Pintor Profesional - Especialista en Acabados Premium',
  45.00,
  12,
  true,
  '["Pintura interior", "Pintura exterior", "Pintura decorativa", "Estucado veneciano", "Restauración de fachadas", "Lacado de puertas"]'::jsonb,
  '["Certificado Profesional en Pintura Decorativa", "Formación en seguridad y prevención", "Especialización en pinturas ecológicas"]'::jsonb,
  ARRAY['Español', 'Inglés'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  titulo = EXCLUDED.titulo,
  tarifa_por_hora = EXCLUDED.tarifa_por_hora,
  años_experiencia = EXCLUDED.años_experiencia,
  disponible = EXCLUDED.disponible,
  habilidades = EXCLUDED.habilidades,
  certificaciones = EXCLUDED.certificaciones,
  idiomas = EXCLUDED.idiomas,
  updated_at = NOW();

-- Buscar categoría de Pintura
SELECT id INTO categoria_pintura FROM public.categorias WHERE nombre ILIKE '%pintura%' LIMIT 1;

-- Si no existe, crearla
IF categoria_pintura IS NULL THEN
  INSERT INTO public.categorias (nombre, descripcion, color)
  VALUES ('Pintura', 'Servicios de pintura interior y exterior', '#3B82F6')
  RETURNING id INTO categoria_pintura;
END IF;

-- Crear algunos proyectos de portfolio para el proveedor
INSERT INTO public.portfolio (profesional_id, titulo, descripcion, categoria, ubicacion, presupuesto, duracion, fecha_proyecto, imagenes, visible, created_at)
VALUES 
  (
    proveedor_id,
    'Reforma completa de vivienda en Chamberí',
    'Pintura completa de vivienda de 120m2 incluyendo salón, 3 dormitorios, cocina y baños. Trabajo realizado en colores neutros con acabados mate y satinado. Preparación de paredes, alisado y dos capas de pintura de alta calidad.',
    'Pintura',
    'Madrid - Chamberí',
    2800.00,
    '8 días',
    '2024-01-15',
    ARRAY['/apartment-full-renovation.jpg', '/modern-bathroom-renovation.png'],
    true,
    NOW()
  ),
  (
    proveedor_id,
    'Restauración de fachada histórica',
    'Restauración y pintado de fachada de edificio del siglo XIX. Limpieza, reparación de grietas, imprimación especial y pintura con productos específicos para exteriores. Trabajo en altura con medidas de seguridad.',
    'Pintura',
    'Madrid - Centro',
    5600.00,
    '15 días',
    '2023-10-20',
    ARRAY['/building-facade-renovation.png'],
    true,
    NOW()
  ),
  (
    proveedor_id,
    'Cocina moderna con acabados especiales',
    'Pintado de cocina con pintura lavable especial para ambientes húmedos. Lacado de puertas de armarios y acabados decorativos en pared principal. Colores personalizados según diseño de interiorista.',
    'Pintura',
    'Madrid - Salamanca',
    1200.00,
    '4 días',
    '2024-02-10',
    ARRAY['/kitchen-renovation-open-concept.jpg'],
    true,
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Actualizar perfil del CLIENTE
UPDATE public.profiles SET
  nombre = 'María',
  apellido = 'González',
  bio = 'Propietaria de vivienda buscando profesionales de confianza para reformas y mantenimiento del hogar.',
  ubicacion = 'Madrid',
  telefono = '+34 687 654 321',
  foto_perfil = '/woman-homeowner.png',
  verificado = true,
  tipo_usuario = 'cliente',
  updated_at = NOW()
WHERE id = cliente_id;

RAISE NOTICE '✅ Perfiles de prueba actualizados correctamente';
RAISE NOTICE '👷 PROVEEDOR: carlos.pintor@skillhub.com / SkillHub2024!';
RAISE NOTICE '👤 CLIENTE: maria.cliente@skillhub.com / SkillHub2024!';
RAISE NOTICE '';
RAISE NOTICE '⚠️  IMPORTANTE: Primero regístrate manualmente con estos emails en la app';

END $$;
