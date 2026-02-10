-- Add commission fields to transacciones_escrow
ALTER TABLE public.transacciones_escrow 
  ADD COLUMN IF NOT EXISTS monto_base DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS comision_cliente DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS comision_proveedor DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS pago_neto_proveedor DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS monto_reembolsado DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS retencion_plataforma DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS fecha_reembolso TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

-- Add 'rechazado' to trabajos estado if not present
-- (estado is likely a text field, no enum change needed)

-- Add review fields to trabajos
ALTER TABLE public.trabajos 
  ADD COLUMN IF NOT EXISTS fecha_entrega TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_cliente_id UUID,
  ADD COLUMN IF NOT EXISTS review_proveedor_id UUID;
