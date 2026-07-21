-- La política de INSERT en `disputas` era admin-only ("Only admins can create
-- disputes"), así que ningún cliente ni profesional podía abrir una disputa:
-- crearDisputa fallaba en silencio por RLS (42501). Esto rompía todo el sistema
-- de disputas para usuarios normales (AbrirDisputaDialog y el rechazo de entrega).
--
-- Las disputas las abren las partes del trabajo, así que se permite insertar
-- cuando el usuario es el cliente o el profesional de la disputa (o un admin).
-- Aplicada ya en producción; queda versionada para reproducibilidad.

drop policy if exists "Only admins can create disputes" on disputas;

create policy "Las partes del trabajo pueden crear disputas"
on disputas
for insert
with check (
  auth.uid() = cliente_id
  or auth.uid() = profesional_id
  or is_admin()
);
