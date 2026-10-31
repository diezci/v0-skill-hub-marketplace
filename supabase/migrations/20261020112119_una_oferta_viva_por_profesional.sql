-- A read-before-insert check cannot serialize concurrent bids. The database
-- owns the invariant, across personal/company identity and direct API writes.
-- Existing duplicates require explicit review; this migration never removes or
-- rewrites historical offers to make the index fit.
CREATE UNIQUE INDEX IF NOT EXISTS ofertas_una_viva_por_profesional
  ON public.ofertas (solicitud_id, profesional_id)
  WHERE estado NOT IN ('rechazada', 'retirada');
