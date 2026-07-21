-- Tabla de incidencias generales (problemas reportados, fraude, abuso, soporte)
CREATE TABLE IF NOT EXISTS incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reportado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asunto TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('fraude','abuso','pago','tecnico','perfil','otro')),
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','critica')),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','en_revision','resuelta','cerrada')),
  trabajo_id UUID REFERENCES trabajos(id) ON DELETE SET NULL,
  usuario_reportado UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notas_admin TEXT,
  resuelto_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_resolucion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias(estado);
CREATE INDEX IF NOT EXISTS idx_incidencias_prioridad ON incidencias(prioridad);
CREATE INDEX IF NOT EXISTS idx_incidencias_reportado ON incidencias(reportado_por);
CREATE INDEX IF NOT EXISTS idx_incidencias_created ON incidencias(created_at DESC);

ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede crear una incidencia (la suya propia)
DROP POLICY IF EXISTS "incidencias_insert_own" ON incidencias;
CREATE POLICY "incidencias_insert_own" ON incidencias
  FOR INSERT WITH CHECK (auth.uid() = reportado_por);

-- El usuario que reportó puede ver sus propias incidencias
DROP POLICY IF EXISTS "incidencias_select_own" ON incidencias;
CREATE POLICY "incidencias_select_own" ON incidencias
  FOR SELECT USING (auth.uid() = reportado_por);

-- Los admins pueden ver todas las incidencias
DROP POLICY IF EXISTS "incidencias_select_admin" ON incidencias;
CREATE POLICY "incidencias_select_admin" ON incidencias
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin')
  );

-- Los admins pueden actualizar
DROP POLICY IF EXISTS "incidencias_update_admin" ON incidencias;
CREATE POLICY "incidencias_update_admin" ON incidencias
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.rol = 'admin')
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_incidencias_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incidencias_updated_at ON incidencias;
CREATE TRIGGER trg_incidencias_updated_at
  BEFORE UPDATE ON incidencias
  FOR EACH ROW EXECUTE FUNCTION update_incidencias_updated_at();
