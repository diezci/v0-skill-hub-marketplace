-- Create admin user for testing/management
-- This script inserts a test admin profile
-- Password: admin123456 (should be changed in production)

INSERT INTO profiles (
  id,
  email,
  nombre,
  apellido,
  rol,
  foto_perfil,
  ubicacion,
  created_at
) VALUES (
  'admin-user-id-123456789',
  'admin@skillhub.com',
  'Admin',
  'System',
  'admin',
  '/admin-avatar.jpg',
  'Administración',
  NOW()
) ON CONFLICT DO NOTHING;

-- Note: The actual user account needs to be created via Supabase Auth separately
-- This just creates the profile record
