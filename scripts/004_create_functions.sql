-- Función para actualizar el timestamp updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Eliminar triggers existentes antes de crearlos
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_profesionales_updated_at ON public.profesionales;
DROP TRIGGER IF EXISTS update_solicitudes_updated_at ON public.solicitudes;
DROP TRIGGER IF EXISTS update_ofertas_updated_at ON public.ofertas;
DROP TRIGGER IF EXISTS update_trabajos_updated_at ON public.trabajos;
DROP TRIGGER IF EXISTS update_transacciones_updated_at ON public.transacciones_escrow;

-- Triggers para actualizar updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profesionales_updated_at BEFORE UPDATE ON public.profesionales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_solicitudes_updated_at BEFORE UPDATE ON public.solicitudes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ofertas_updated_at BEFORE UPDATE ON public.ofertas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trabajos_updated_at BEFORE UPDATE ON public.trabajos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transacciones_updated_at BEFORE UPDATE ON public.transacciones_escrow
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre, apellido)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger para crear perfil al registrarse
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Función para actualizar contador de ofertas
CREATE OR REPLACE FUNCTION update_solicitud_ofertas_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.solicitudes 
    SET total_ofertas = total_ofertas + 1 
    WHERE id = NEW.solicitud_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.solicitudes 
    SET total_ofertas = total_ofertas - 1 
    WHERE id = OLD.solicitud_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger existente antes de crearlo
DROP TRIGGER IF EXISTS trigger_update_ofertas_count ON public.ofertas;

CREATE TRIGGER trigger_update_ofertas_count
AFTER INSERT OR DELETE ON public.ofertas
FOR EACH ROW
EXECUTE FUNCTION update_solicitud_ofertas_count();

-- Función para actualizar rating promedio del profesional
CREATE OR REPLACE FUNCTION update_profesional_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profesionales
  SET 
    rating_promedio = (
      SELECT AVG(rating)::NUMERIC(3,2)
      FROM public.reseñas
      WHERE profesional_id = NEW.profesional_id
    ),
    total_reseñas = (
      SELECT COUNT(*)
      FROM public.reseñas
      WHERE profesional_id = NEW.profesional_id
    )
  WHERE id = NEW.profesional_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger existente antes de crearlo
DROP TRIGGER IF EXISTS trigger_update_profesional_rating ON public.reseñas;

CREATE TRIGGER trigger_update_profesional_rating
AFTER INSERT ON public.reseñas
FOR EACH ROW
EXECUTE FUNCTION update_profesional_rating();
