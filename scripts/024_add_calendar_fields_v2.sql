-- Migration: Add calendar management fields to trabajos table
-- Date: 2024

-- Add hours tracking fields (only if they don't exist)
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS horas_estimadas INTEGER DEFAULT 0;
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS horas_registradas INTEGER DEFAULT 0;

-- Add private notes for provider
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS notas_privadas_proveedor TEXT;

-- Add priority field
ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente'));

-- Create index for calendar queries (by professional and date range)
CREATE INDEX IF NOT EXISTS idx_trabajos_calendario 
ON trabajos (profesional_id, fecha_inicio, fecha_estimada_fin) 
WHERE estado IN ('en_progreso', 'pendiente', 'pendiente_pago');
