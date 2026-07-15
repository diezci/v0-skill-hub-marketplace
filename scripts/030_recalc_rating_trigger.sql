-- Recalcula rating_promedio/total_reseñas del profesional cuando cambian sus
-- reseñas. SECURITY DEFINER para saltar la RLS: el autor de la reseña no es
-- dueño de la fila de profesionales y su UPDATE quedaba bloqueado, dejando el
-- rating del perfil desincronizado (0) pese a existir reseñas.
CREATE OR REPLACE FUNCTION public.recalc_rating_profesional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pid uuid := COALESCE(NEW.profesional_id, OLD.profesional_id);
BEGIN
  UPDATE public.profesionales p
  SET
    rating_promedio = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reseñas r WHERE r.profesional_id = pid), 0),
    total_reseñas   = (SELECT COUNT(*) FROM public.reseñas r WHERE r.profesional_id = pid)
  WHERE p.id = pid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_rating ON public.reseñas;
CREATE TRIGGER trg_recalc_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reseñas
  FOR EACH ROW EXECUTE FUNCTION public.recalc_rating_profesional();

-- Backfill de los ratings desincronizados.
UPDATE public.profesionales p
SET
  rating_promedio = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reseñas r WHERE r.profesional_id = p.id), 0),
  total_reseñas   = (SELECT COUNT(*) FROM public.reseñas r WHERE r.profesional_id = p.id);
