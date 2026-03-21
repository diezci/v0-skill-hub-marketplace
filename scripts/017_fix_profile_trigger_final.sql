-- =====================================================
-- FIX DEFINITIVO PARA CREACIÓN DE PERFILES
-- =====================================================
-- Este script crea un trigger que automáticamente crea 
-- un perfil cuando un usuario se registra (email o OAuth)

-- Eliminar trigger y función existentes
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Crear función con SECURITY DEFINER para bypasear RLS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_nombre TEXT;
  user_apellido TEXT;
  user_foto TEXT;
  full_name TEXT;
BEGIN
  -- Obtener nombre del usuario de los metadatos
  full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'nombre',
    split_part(NEW.email, '@', 1)
  );
  
  -- Separar nombre y apellido
  user_nombre := split_part(full_name, ' ', 1);
  user_apellido := NULLIF(TRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)), '');
  
  -- Obtener foto de perfil (para OAuth)
  user_foto := NEW.raw_user_meta_data->>'avatar_url';
  IF user_foto IS NULL THEN
    user_foto := NEW.raw_user_meta_data->>'picture';
  END IF;

  -- Insertar perfil o actualizar si ya existe
  INSERT INTO public.profiles (
    id,
    email,
    nombre,
    apellido,
    foto_perfil,
    tipo_usuario,
    verificado,
    fecha_registro,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_nombre,
    user_apellido,
    user_foto,
    'cliente',
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), profiles.nombre),
    apellido = COALESCE(EXCLUDED.apellido, profiles.apellido),
    foto_perfil = COALESCE(EXCLUDED.foto_perfil, profiles.foto_perfil),
    verificado = COALESCE(NEW.email_confirmed_at IS NOT NULL, profiles.verificado),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error pero no fallar el registro
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Crear trigger que se ejecuta después de insertar un usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- También crear trigger para cuando el usuario confirma email
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Actualizar verificación cuando se confirma el email
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET 
      verificado = true,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- Asegurar permisos correctos
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
