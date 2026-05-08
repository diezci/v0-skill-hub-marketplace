-- Notificaciones table
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  link TEXT,
  leida BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leida, created_at DESC);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON notificaciones;
CREATE POLICY "Users can view their own notifications" ON notificaciones
  FOR SELECT USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON notificaciones;
CREATE POLICY "Users can update their own notifications" ON notificaciones
  FOR UPDATE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Authenticated can create notifications" ON notificaciones;
CREATE POLICY "Authenticated can create notifications" ON notificaciones
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Favoritos table
CREATE TABLE IF NOT EXISTS favoritos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, profesional_id)
);

CREATE INDEX IF NOT EXISTS idx_favoritos_cliente ON favoritos(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favoritos_profesional ON favoritos(profesional_id);

ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their favorites" ON favoritos;
CREATE POLICY "Users can manage their favorites" ON favoritos
  FOR ALL USING (auth.uid() = cliente_id);

DROP POLICY IF EXISTS "Users can view their favorites" ON favoritos;
CREATE POLICY "Users can view their favorites" ON favoritos
  FOR SELECT USING (auth.uid() = cliente_id);
