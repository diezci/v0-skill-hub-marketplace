-- Permitir que el profesional elimine sus propias ofertas (mientras no estén
-- aceptadas; la comprobación de estado se hace en el server action).
-- Aplicado el 2026-06-19.
create policy "Profesionales pueden eliminar sus ofertas"
on public.ofertas
for delete
to authenticated
using (auth.uid() = profesional_id);
