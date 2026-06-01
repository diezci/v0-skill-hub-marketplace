-- Ensure RLS policies allow proper visibility of solicitudes
-- 1. Anyone (authenticated or anonymous) can view "abierta" solicitudes
-- 2. The owner (cliente) can always view their own solicitudes regardless of estado
-- 3. The owner can update/delete their own solicitudes

-- Make sure RLS is enabled
ALTER TABLE solicitudes ENABLE ROW LEVEL SECURITY;

-- Drop OLD policy names (in case they exist)
DROP POLICY IF EXISTS "Todos pueden ver solicitudes abiertas" ON solicitudes;
DROP POLICY IF EXISTS "Clientes pueden ver sus propias solicitudes" ON solicitudes;
DROP POLICY IF EXISTS "Clientes pueden crear solicitudes" ON solicitudes;
DROP POLICY IF EXISTS "Clientes pueden actualizar sus solicitudes" ON solicitudes;
DROP POLICY IF EXISTS "Clientes pueden eliminar sus solicitudes" ON solicitudes;

-- Drop NEW policy names (in case the script ran partially before)
DROP POLICY IF EXISTS "Ver solicitudes abiertas o propias" ON solicitudes;
DROP POLICY IF EXISTS "Crear solicitudes propias" ON solicitudes;
DROP POLICY IF EXISTS "Actualizar solicitudes propias" ON solicitudes;
DROP POLICY IF EXISTS "Eliminar solicitudes propias" ON solicitudes;

-- SELECT: anyone can see open solicitudes OR the owner sees their own
CREATE POLICY "Ver solicitudes abiertas o propias"
ON solicitudes FOR SELECT
USING (
  estado = 'abierta' OR cliente_id = auth.uid()
);

-- INSERT: authenticated users can create their own solicitudes
CREATE POLICY "Crear solicitudes propias"
ON solicitudes FOR INSERT
WITH CHECK (cliente_id = auth.uid());

-- UPDATE: only the owner can update
CREATE POLICY "Actualizar solicitudes propias"
ON solicitudes FOR UPDATE
USING (cliente_id = auth.uid())
WITH CHECK (cliente_id = auth.uid());

-- DELETE: only the owner can delete
CREATE POLICY "Eliminar solicitudes propias"
ON solicitudes FOR DELETE
USING (cliente_id = auth.uid());
