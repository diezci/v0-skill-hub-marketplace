-- First drop the trigger that depends on the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Now we can safely drop and recreate the function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create the function with correct column names
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_nombre TEXT;
  user_email TEXT;
BEGIN
  -- Get name from metadata or email
  user_nombre := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'nombre',
    split_part(NEW.email, '@', 1)
  );
  
  user_email := COALESCE(NEW.email, '');

  -- Insert into perfiles table with correct column names
  INSERT INTO public.perfiles (
    id,
    nombre,
    email,
    tipo_usuario,
    foto_perfil,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_nombre,
    user_email,
    'cliente',
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre = COALESCE(EXCLUDED.nombre, perfiles.nombre),
    email = COALESCE(EXCLUDED.email, perfiles.email),
    foto_perfil = COALESCE(NULLIF(EXCLUDED.foto_perfil, ''), perfiles.foto_perfil),
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.perfiles TO anon, authenticated;
