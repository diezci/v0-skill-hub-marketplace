-- Add admin role to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS es_admin boolean DEFAULT false;

-- Create disputes table
CREATE TABLE IF NOT EXISTS disputas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id uuid NOT NULL REFERENCES trabajos(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profesional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo varchar(50) NOT NULL, -- 'no_completion', 'payment_issue', 'quality', 'other'
  motivo text NOT NULL,
  estado varchar(50) NOT NULL DEFAULT 'abierta', -- 'abierta', 'en_revision', 'resuelta', 'cancelada'
  resolucion text,
  resultado varchar(50), -- 'cliente_gana', 'profesional_gana', 'acuerdo_mutuo'
  resuelto_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_resolucion timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create dispute evidences table
CREATE TABLE IF NOT EXISTS evidencias_disputa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disputa_id uuid NOT NULL REFERENCES disputas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo varchar(50) NOT NULL, -- 'documento', 'foto', 'mensaje'
  archivo_url text,
  descripcion text,
  created_at timestamp DEFAULT now()
);

-- Enable RLS for disputes
ALTER TABLE disputas ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencias_disputa ENABLE ROW LEVEL SECURITY;

-- RLS Policies for disputes
CREATE POLICY "Users can view their disputes" ON disputas
  FOR SELECT USING (
    auth.uid() = cliente_id OR
    auth.uid() = profesional_id OR
    (SELECT es_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Only admins can create disputes" ON disputas
  FOR INSERT WITH CHECK (
    (SELECT es_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Only admins can update disputes" ON disputas
  FOR UPDATE USING (
    (SELECT es_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can view dispute evidences" ON evidencias_disputa
  FOR SELECT USING (
    auth.uid() IN (
      SELECT cliente_id FROM disputas WHERE id = disputa_id
      UNION
      SELECT profesional_id FROM disputas WHERE id = disputa_id
    )
    OR (SELECT es_admin FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can add evidences to their disputes" ON evidencias_disputa
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT cliente_id FROM disputas WHERE id = disputa_id
      UNION
      SELECT profesional_id FROM disputas WHERE id = disputa_id
    )
  );
