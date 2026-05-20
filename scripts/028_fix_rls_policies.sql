-- Fix RLS policies for solicitudes to allow clients to see their own solicitudes regardless of estado
-- Also fix profesionales to allow profile creation properly

-- Drop the restrictive SELECT policy and replace with one that allows owners to see their own
DROP POLICY IF EXISTS "Todos pueden ver solicitudes abiertas" ON public.solicitudes;

CREATE POLICY "Ver solicitudes abiertas o propias"
ON public.solicitudes
FOR SELECT
USING (
  estado = 'abierta'
  OR cliente_id = auth.uid()
);

-- Make sure profesionales has an UPDATE policy that allows users to update their own row
DROP POLICY IF EXISTS "Profesionales pueden actualizar su perfil" ON public.profesionales;

CREATE POLICY "Profesionales pueden actualizar su perfil"
ON public.profesionales
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
