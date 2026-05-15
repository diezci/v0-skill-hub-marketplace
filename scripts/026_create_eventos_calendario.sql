-- Tabla de eventos personalizados del calendario (no asociados a trabajos)
CREATE TABLE IF NOT EXISTS eventos_calendario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha_inicio TIMESTAMPTZ NOT NULL,
  fecha_fin TIMESTAMPTZ,
  color TEXT DEFAULT 'emerald',
  tipo TEXT DEFAULT 'personal',
  todo_el_dia BOOLEAN DEFAULT TRUE,
  ubicacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_calendario_usuario ON eventos_calendario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_eventos_calendario_fecha ON eventos_calendario(fecha_inicio);

ALTER TABLE eventos_calendario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus eventos" ON eventos_calendario;
CREATE POLICY "Usuarios ven sus eventos" ON eventos_calendario
  FOR SELECT USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuarios crean sus eventos" ON eventos_calendario;
CREATE POLICY "Usuarios crean sus eventos" ON eventos_calendario
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuarios editan sus eventos" ON eventos_calendario;
CREATE POLICY "Usuarios editan sus eventos" ON eventos_calendario
  FOR UPDATE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuarios borran sus eventos" ON eventos_calendario;
CREATE POLICY "Usuarios borran sus eventos" ON eventos_calendario
  FOR DELETE USING (auth.uid() = usuario_id);
