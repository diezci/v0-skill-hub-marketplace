-- Create invitaciones table for AI-generated supplier invitations
CREATE TABLE IF NOT EXISTS invitaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitud_id UUID REFERENCES solicitudes(id) ON DELETE CASCADE NOT NULL,
  nombre_empresa TEXT NOT NULL,
  email_empresa TEXT NOT NULL,
  descripcion_empresa TEXT,
  sitio_web TEXT,
  token UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  estado TEXT DEFAULT 'enviada' CHECK (estado IN ('enviada', 'abierta', 'registrado', 'rechazada')),
  enviado_at TIMESTAMPTZ DEFAULT NOW(),
  abierto_at TIMESTAMPTZ,
  registrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

-- Admins can see all invitations
CREATE POLICY "Admins can manage invitaciones"
  ON invitaciones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.es_admin = true
    )
  );

-- Clients can see invitations for their own solicitudes
CREATE POLICY "Clients can view their solicitud invitaciones"
  ON invitaciones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM solicitudes
      WHERE solicitudes.id = invitaciones.solicitud_id
      AND solicitudes.cliente_id = auth.uid()
    )
  );

-- Index for fast lookup by solicitud
CREATE INDEX IF NOT EXISTS idx_invitaciones_solicitud_id ON invitaciones(solicitud_id);
-- Index for token lookup (invitation link tracking)
CREATE INDEX IF NOT EXISTS idx_invitaciones_token ON invitaciones(token);
