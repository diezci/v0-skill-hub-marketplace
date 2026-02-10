-- Add progress tracking fields to trabajos table
ALTER TABLE public.trabajos 
ADD COLUMN IF NOT EXISTS progreso INTEGER DEFAULT 0 CHECK (progreso >= 0 AND progreso <= 100),
ADD COLUMN IF NOT EXISTS fecha_estimada_fin TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS fecha_entrega TIMESTAMP WITH TIME ZONE;

-- Create actualizaciones_trabajo table for progress history
CREATE TABLE IF NOT EXISTS public.actualizaciones_trabajo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('progreso', 'mensaje', 'entrega', 'confirmacion', 'disputa')),
  mensaje TEXT,
  progreso INTEGER CHECK (progreso >= 0 AND progreso <= 100),
  archivos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.actualizaciones_trabajo ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view updates for their own trabajos
CREATE POLICY "Users can view their trabajo updates"
  ON public.actualizaciones_trabajo
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trabajos t
      WHERE t.id = trabajo_id
      AND (t.cliente_id = auth.uid() OR t.profesional_id = auth.uid())
    )
  );

-- Policy: Users can create updates for their trabajos
CREATE POLICY "Users can create updates for their trabajos"
  ON public.actualizaciones_trabajo
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trabajos t
      WHERE t.id = trabajo_id
      AND (t.cliente_id = auth.uid() OR t.profesional_id = auth.uid())
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_actualizaciones_trabajo_trabajo_id ON public.actualizaciones_trabajo(trabajo_id);
CREATE INDEX IF NOT EXISTS idx_actualizaciones_trabajo_created_at ON public.actualizaciones_trabajo(created_at DESC);
