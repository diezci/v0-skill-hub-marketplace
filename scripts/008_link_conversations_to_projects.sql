-- Add solicitud_id and trabajo_id columns to conversaciones table
ALTER TABLE public.conversaciones 
ADD COLUMN IF NOT EXISTS solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS trabajo_id UUID REFERENCES public.trabajos(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversaciones_solicitud ON public.conversaciones(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_trabajo ON public.conversaciones(trabajo_id);

-- Add unique constraint to prevent duplicate conversations for the same project
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_conversation_solicitud 
ON public.conversaciones(participante_1, participante_2, solicitud_id) 
WHERE solicitud_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_conversation_trabajo 
ON public.conversaciones(participante_1, participante_2, trabajo_id) 
WHERE trabajo_id IS NOT NULL;
