-- Script de prueba completo para el sistema de admin y disputas
-- Este script crea usuarios de prueba, trabajos y disputas

-- 1. CREAR USUARIO ADMIN (cambiar email si es necesario)
INSERT INTO profiles (id, email, nombre, apellido, bio, ubicacion, telefono, foto_perfil, tipo_usuario, es_admin, verificado, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@skillhub.test',
  'Admin',
  'SkillHub',
  'Administrador del sistema',
  'Madrid',
  '+34 600 000 001',
  'https://placeholder.com/admin.jpg',
  'admin',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 2. CREAR USUARIO CLIENTE
INSERT INTO profiles (id, email, nombre, apellido, bio, ubicacion, telefono, foto_perfil, tipo_usuario, es_admin, verificado, created_at, updated_at)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'cliente@skillhub.test',
  'Juan',
  'Cliente',
  'Busco profesionales para mis proyectos',
  'Madrid',
  '+34 600 000 002',
  'https://placeholder.com/client.jpg',
  'cliente',
  false,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 3. CREAR USUARIO PROVEEDOR/PROFESIONAL
INSERT INTO profiles (id, email, nombre, apellido, bio, ubicacion, telefono, foto_perfil, tipo_usuario, es_admin, verificado, created_at, updated_at)
VALUES (
  'p0000000-0000-0000-0000-000000000001',
  'proveedor@skillhub.test',
  'Carlos',
  'Proveedor',
  'Especialista en reformas y pintura',
  'Barcelona',
  '+34 600 000 003',
  'https://placeholder.com/provider.jpg',
  'profesional',
  false,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 4. CREAR PERFIL PROFESIONAL
INSERT INTO profesionales (id, titulo, disponible, tarifa_por_hora, años_experiencia, total_trabajos, total_reseñas, rating_promedio, created_at, updated_at)
VALUES (
  'p0000000-0000-0000-0000-000000000001',
  'Pintor profesional y reformas',
  true,
  50.00,
  8,
  12,
  10,
  4.8,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 5. CREAR CATEGORÍA SI NO EXISTE
INSERT INTO categorias (id, nombre, descripcion, icono, color)
VALUES (
  'cat00000-0000-0000-0000-000000000001',
  'Pintura',
  'Trabajos de pintura y decoración',
  'paint',
  '#3B82F6'
)
ON CONFLICT (id) DO NOTHING;

-- 6. CREAR SOLICITUD DE CLIENTE
INSERT INTO solicitudes (id, cliente_id, categoria_id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, estado, created_at, updated_at)
VALUES (
  'sol00000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'cat00000-0000-0000-0000-000000000001',
  'Necesito pintar mi salón',
  'Quiero pintar el salón de mi casa de color azul claro. La sala tiene aproximadamente 40 m2.',
  'Madrid',
  300.00,
  600.00,
  'media',
  'abierta',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 7. CREAR OFERTA DEL PROVEEDOR
INSERT INTO ofertas (id, solicitud_id, profesional_id, precio, descripcion, tiempo_estimado, unidad_tiempo, condiciones_pago, estado, created_at, updated_at)
VALUES (
  'ofe00000-0000-0000-0000-000000000001',
  'sol00000-0000-0000-0000-000000000001',
  'p0000000-0000-0000-0000-000000000001',
  500.00,
  'Pintura de calidad profesional, incluye preparación de paredes y dos capas',
  3,
  'dias',
  '50% al inicio, 50% al finalizar',
  'pendiente',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 8. CREAR TRABAJO (simulando aceptación de oferta)
INSERT INTO trabajos (id, solicitud_id, oferta_id, cliente_id, profesional_id, titulo, descripcion, precio_acordado, estado, progreso, ubicacion, created_at, updated_at)
VALUES (
  'trab0000-0000-0000-0000-000000000001',
  'sol00000-0000-0000-0000-000000000001',
  'ofe00000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'p0000000-0000-0000-0000-000000000001',
  'Pintar salón',
  'Pintura del salón de color azul claro',
  500.00,
  'en_progreso',
  50,
  'Madrid',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 9. CREAR TRANSACCIÓN ESCROW
INSERT INTO transacciones_escrow (id, trabajo_id, cliente_id, profesional_id, monto_base, comision_cliente, comision_proveedor, pago_neto_proveedor, monto, estado, created_at, updated_at)
VALUES (
  'esc00000-0000-0000-0000-000000000001',
  'trab0000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'p0000000-0000-0000-0000-000000000001',
  500.00,
  50.00,
  25.00,
  475.00,
  550.00,
  'retenido',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 10. CREAR DISPUTA (simular rechazo del trabajo)
INSERT INTO disputas (id, trabajo_id, cliente_id, profesional_id, tipo, motivo, estado, created_at)
VALUES (
  'disp0000-0000-0000-0000-000000000001',
  'trab0000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'p0000000-0000-0000-0000-000000000001',
  'calidad',
  'El color de la pintura no es el acordado. Se especificó azul claro pero quedó más oscuro',
  'abierta',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- MOSTRAR RESUMEN
SELECT 'SETUP COMPLETADO - Datos de prueba creados' as status;

-- Cuentas creadas:
-- ADMIN: admin@skillhub.test / Contraseña: (crear manualmente en Supabase Auth)
-- CLIENTE: cliente@skillhub.test / Contraseña: (crear manualmente en Supabase Auth)
-- PROVEEDOR: proveedor@skillhub.test / Contraseña: (crear manualmente en Supabase Auth)
