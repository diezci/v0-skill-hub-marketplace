-- Correcciones para que el flujo de publicar demanda y aceptar oferta/escrow funcione.
-- Aplicado el 2026-06-15.

-- 1) Permitir que usuarios autenticados creen categorías que aún no existan.
--    crearSolicitud() crea la categoría si no la encuentra; sin esta política
--    el INSERT lo bloqueaba RLS y la demanda quedaba sin categoría.
drop policy if exists "Usuarios autenticados pueden crear categorías" on public.categorias;
create policy "Usuarios autenticados pueden crear categorías"
on public.categorias
for insert
to authenticated
with check (true);

-- 2) Alinear las constraints de estado con la máquina de estados de la app.
--    ofertas: el código usa 'pendiente'; trabajos: usa 'pendiente_pago',
--    'entregado' y 'rechazado'. Sin estos valores los INSERT/UPDATE fallaban.
alter table public.ofertas drop constraint if exists ofertas_estado_check;
alter table public.ofertas add constraint ofertas_estado_check
  check (estado = any (array['pendiente','enviada','aceptada','rechazada','en_negociacion','retirada']));

alter table public.trabajos drop constraint if exists trabajos_estado_check;
alter table public.trabajos add constraint trabajos_estado_check
  check (estado = any (array['pendiente','pendiente_pago','en_progreso','entregado','completado','rechazado','cancelado','en_disputa']));

-- 3) Permitir que el cliente (dueño de la solicitud) actualice las ofertas de
--    su solicitud, para poder marcar una como aceptada y rechazar las demás
--    al aceptar una oferta.
drop policy if exists "Clientes pueden actualizar ofertas de sus solicitudes" on public.ofertas;
create policy "Clientes pueden actualizar ofertas de sus solicitudes"
on public.ofertas
for update
to authenticated
using (auth.uid() in (select cliente_id from public.solicitudes where id = ofertas.solicitud_id))
with check (auth.uid() in (select cliente_id from public.solicitudes where id = ofertas.solicitud_id));
