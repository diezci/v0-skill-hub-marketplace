BEGIN;

-- A replacement is a new proposal and contract decision, never a reassignment
-- of the departed professional's offer, files or conversation.
ALTER TABLE public.ofertas ADD COLUMN oferta_origen_id uuid REFERENCES public.ofertas(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX ofertas_sustitucion_activa_unica ON public.ofertas(oferta_origen_id)
  WHERE oferta_origen_id IS NOT NULL AND estado NOT IN ('rechazada','retirada');
CREATE INDEX ofertas_origen_idx ON public.ofertas(oferta_origen_id) WHERE oferta_origen_id IS NOT NULL;

CREATE FUNCTION diime_private.oferta_contexto_sustitucion(p_oferta_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.ofertas%rowtype; s public.solicitudes%rowtype; actor uuid:=auth.uid(); empresa_nombre text;
BEGIN
  SELECT * INTO o FROM public.ofertas WHERE id=p_oferta_id;
  IF actor IS NULL OR o.id IS NULL OR o.empresa_id IS NULL OR o.profesional_id=actor
    OR NOT diime_private.empresa_tiene_permiso(o.empresa_id,actor,'presupuestos')
    OR NOT EXISTS(SELECT 1 FROM public.profesionales WHERE id=actor) THEN
    RAISE EXCEPTION 'No tienes permiso para sustituir esta oferta' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM public.solicitudes WHERE id=o.solicitud_id;
  IF s.estado IS DISTINCT FROM 'abierta' OR o.estado NOT IN ('pendiente','enviada','en_negociacion')
    OR diime_private.empresa_tiene_permiso(o.empresa_id,o.profesional_id,'presupuestos')
    OR EXISTS(SELECT 1 FROM public.trabajos WHERE oferta_id=o.id)
    OR EXISTS(SELECT 1 FROM public.ofertas WHERE oferta_origen_id=o.id AND estado NOT IN ('rechazada','retirada')) THEN
    RAISE EXCEPTION 'Esta oferta no admite una nueva sustitución' USING ERRCODE='55000';
  END IF;
  SELECT e.nombre INTO empresa_nombre FROM public.empresas e WHERE e.id=o.empresa_id;
  RETURN jsonb_build_object('oferta_origen_id',o.id,'solicitud_id',s.id,'empresa_id',o.empresa_id,
    'empresa_nombre',empresa_nombre,'titulo',s.titulo);
END;
$$;
REVOKE ALL ON FUNCTION diime_private.oferta_contexto_sustitucion(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.empresa_oferta_sustitucion_contexto(p_oferta_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT diime_private.oferta_contexto_sustitucion(p_oferta_id);
$$;
REVOKE ALL ON FUNCTION public.empresa_oferta_sustitucion_contexto(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.empresa_oferta_sustitucion_contexto(uuid) TO authenticated;

CREATE FUNCTION diime_private.validar_oferta_sustitucion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE contexto jsonb; origen public.ofertas%rowtype;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF EXISTS(SELECT 1 FROM public.ofertas WHERE oferta_origen_id=OLD.id) THEN
      RAISE EXCEPTION 'La oferta original se conserva como historial de su sustitución' USING ERRCODE='55000';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF NEW.oferta_origen_id IS DISTINCT FROM OLD.oferta_origen_id THEN
      RAISE EXCEPTION 'El vínculo con la oferta original es inmutable' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.oferta_origen_id IS NULL THEN RETURN NEW; END IF;
  -- All replacements of one origin serialize on that origin. Membership locks
  -- serialize permission removal; the regular offer guards still apply.
  SELECT * INTO origen FROM public.ofertas WHERE id=NEW.oferta_origen_id FOR UPDATE;
  IF origen.id IS NULL THEN RAISE EXCEPTION 'No tienes permiso para sustituir esta oferta' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.empresa_miembros WHERE empresa_id=origen.empresa_id
    AND usuario_id IN (auth.uid(),origen.profesional_id) ORDER BY usuario_id FOR SHARE;
  contexto:=diime_private.oferta_contexto_sustitucion(origen.id);
  IF NEW.profesional_id IS DISTINCT FROM auth.uid() OR NEW.empresa_id IS DISTINCT FROM origen.empresa_id
    OR NEW.solicitud_id IS DISTINCT FROM origen.solicitud_id OR NEW.id=origen.id THEN
    RAISE EXCEPTION 'La sustitución debe conservar la empresa y la solicitud con un nuevo profesional' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION diime_private.validar_oferta_sustitucion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validar_oferta_sustitucion BEFORE INSERT OR UPDATE OR DELETE ON public.ofertas
  FOR EACH ROW EXECUTE FUNCTION diime_private.validar_oferta_sustitucion();
COMMIT;
