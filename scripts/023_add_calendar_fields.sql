-- Migration: Add calendar management fields to trabajos table
-- This enables professionals to track time estimates and private notes for their work

-- Add new columns to trabajos table for calendar/time management
ALTER TABLE trabajos 
ADD COLUMN IF NOT EXISTS horas_estimadas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS horas_registradas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS notas_privadas_proveedor TEXT,
ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
ADD COLUMN IF NOT EXISTS fecha_estimada_fin DATE,
ADD COLUMN IF NOT EXISTS prioridad TEXT DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta', 'urgente'));

-- Add index for faster calendar queries by provider
CREATE INDEX IF NOT EXISTS idx_trabajos_proveedor_fechas 
ON trabajos(proveedor_id, fecha_inicio, fecha_estimada_fin);

-- Add index for filtering by status and dates
CREATE INDEX IF NOT EXISTS idx_trabajos_estado_fechas 
ON trabajos(estado, fecha_inicio, fecha_estimada_fin);

-- Comment on new columns
COMMENT ON COLUMN trabajos.horas_estimadas IS 'Estimated hours to complete the work';
COMMENT ON COLUMN trabajos.horas_registradas IS 'Actual hours worked so far';
COMMENT ON COLUMN trabajos.notas_privadas_proveedor IS 'Private notes only visible to the provider';
COMMENT ON COLUMN trabajos.fecha_inicio IS 'Scheduled start date for the work';
COMMENT ON COLUMN trabajos.fecha_estimada_fin IS 'Estimated completion date';
COMMENT ON COLUMN trabajos.prioridad IS 'Priority level: baja, media, alta, urgente';
