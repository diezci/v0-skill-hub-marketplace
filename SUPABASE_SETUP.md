# Configuración de Supabase para Testing

## Problema: "Email rate limit exceeded"

Si ves el error `over_email_send_rate_limit` al intentar registrar usuarios, significa que has excedido el límite de emails que Supabase puede enviar por hora (usualmente 3-4 emails/hora en el plan gratuito).

## Solución 1: Deshabilitar Confirmación de Email (Recomendado para Testing)

Para testing y desarrollo, puedes deshabilitar la confirmación de email:

### Pasos:

1. Ve a tu proyecto de Supabase: https://supabase.com/dashboard
2. Navega a **Authentication** → **Providers** → **Email**
3. Desactiva la opción **"Confirm email"**
4. Guarda los cambios

Con esto, los usuarios se registrarán inmediatamente sin necesidad de confirmar email.

## Solución 2: Esperar 1 hora

El límite de emails se resetea cada hora. Simplemente espera 60 minutos antes de crear más cuentas.

## Solución 3: Usar el SQL Editor para crear usuarios directamente

Puedes crear usuarios directamente en la base de datos sin pasar por el límite de emails:

\`\`\`sql
-- 1. Crear usuario en auth.users (usando password hasheado)
-- Nota: Esto es solo para testing, en producción usa el sistema de auth normal

-- Para testing rápido, primero crea el perfil directamente
INSERT INTO public.profiles (id, email, nombre, apellido, ubicacion, verificado, created_at, updated_at)
VALUES (
  gen_random_uuid(), -- Genera un UUID aleatorio
  'test@example.com',
  'Test',
  'User',
  'Madrid',
  true,
  NOW(),
  NOW()
);
\`\`\`

**IMPORTANTE:** Esta opción crea solo el perfil, no el usuario de auth. Para login necesitarás usar la Solución 1.

## Solución 4: Upgrade del Plan de Supabase

Si necesitas crear muchos usuarios, considera actualizar tu plan de Supabase para aumentar los límites:
- **Free tier**: ~3-4 emails/hora
- **Pro tier**: Límites mucho más altos

## Recomendación para Producción

Una vez que lances tu app:
- **Mantén la confirmación de email activada** para seguridad
- **Configura un dominio personalizado** para emails
- **Configura templates de email** personalizados
- **Monitorea los límites** de tu plan

## Para Testing del Sistema de Pagos

Para probar el sistema de pagos sin crear múltiples usuarios:

1. Crea 2-3 usuarios (uno cliente, uno proveedor, uno admin)
2. Usa esos mismos usuarios para todas tus pruebas
3. Limpia y recrea transacciones según necesites
4. No necesitas crear usuarios nuevos para cada test

### Script para usar usuarios existentes:

\`\`\`sql
-- Ver todos los usuarios actuales
SELECT id, email, nombre, apellido, rol FROM profiles;

-- Cambiar rol de un usuario
UPDATE profiles SET rol = 'proveedor' WHERE email = 'tumail@example.com';
UPDATE profiles SET rol = 'cliente' WHERE email = 'otromail@example.com';
UPDATE profiles SET rol = 'admin' WHERE email = 'admin@example.com';
\`\`\`

## Verificar que funciona

Después de deshabilitar la confirmación de email:

1. Intenta registrar un nuevo usuario
2. Deberías ser redirigido inmediatamente sin ver mensaje de "Confirma tu email"
3. El usuario aparecerá en la tabla `auth.users` con `email_confirmed_at` ya rellenado
