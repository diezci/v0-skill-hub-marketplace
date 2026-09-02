-- Los trabajos marcados como visibles deben poder consultarse desde la ficha
-- profesional, tanto sin sesión como desde la cuenta de otro usuario. El dueño
-- conserva acceso a sus borradores/no visibles para poder gestionarlos.

alter table public.portfolio enable row level security;

-- Las filas antiguas sin valor se crearon antes de que `visible` tuviera un
-- uso efectivo en la ficha. Se consideran publicadas, igual que el default.
update public.portfolio
set visible = true
where visible is null;

alter table public.portfolio
  alter column visible set default true,
  alter column visible set not null;

drop policy if exists "Todos pueden ver portfolio visible" on public.portfolio;
create policy "Todos pueden ver portfolio visible"
on public.portfolio
for select
to anon, authenticated
using (visible is true or auth.uid() = profesional_id);

-- No basta con ocultar el importe en React: si `presupuesto` mantiene el
-- permiso SELECT, cualquier visitante podría leerlo directamente a través de
-- la API de Supabase. Se conceden solo las columnas realmente públicas.
revoke select on table public.portfolio from public, anon, authenticated;
grant select (
  id,
  profesional_id,
  trabajo_id,
  titulo,
  descripcion,
  categoria,
  imagenes,
  ubicacion,
  duracion,
  fecha_proyecto,
  visible,
  created_at,
  contexto_proveedor
) on public.portfolio to anon, authenticated;

-- El perfil público recibe un número de tramo (0..10), nunca el precio. La
-- aplicación lo convierte en textos como "1.000€ – 2.500€".
create or replace function public.portfolio_publico(p_profesional_id uuid)
returns table (
  id uuid,
  trabajo_id uuid,
  titulo text,
  descripcion text,
  categoria text,
  imagenes text[],
  ubicacion text,
  duracion text,
  fecha_proyecto date,
  contexto_proveedor text,
  tramo_precio smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.trabajo_id,
    p.titulo,
    p.descripcion,
    p.categoria,
    p.imagenes,
    p.ubicacion,
    p.duracion,
    p.fecha_proyecto,
    p.contexto_proveedor,
    case
      when p.presupuesto is null or p.presupuesto <= 0 then null
      when p.presupuesto < 100 then 0
      when p.presupuesto < 250 then 1
      when p.presupuesto < 500 then 2
      when p.presupuesto < 1000 then 3
      when p.presupuesto < 2500 then 4
      when p.presupuesto < 5000 then 5
      when p.presupuesto < 10000 then 6
      when p.presupuesto < 25000 then 7
      when p.presupuesto < 50000 then 8
      when p.presupuesto < 100000 then 9
      else 10
    end::smallint as tramo_precio
  from public.portfolio p
  where p.profesional_id = p_profesional_id
    and p.visible is true
  order by p.fecha_proyecto desc nulls last, p.created_at desc;
$$;

-- El editor del portfolio sí necesita recuperar el valor real, pero esta
-- función no acepta un id arbitrario: siempre limita las filas a auth.uid().
create or replace function public.mi_portfolio()
returns setof public.portfolio
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.portfolio p
  where p.profesional_id = auth.uid()
  order by p.fecha_proyecto desc nulls last, p.created_at desc;
$$;

revoke all on function public.portfolio_publico(uuid) from public;
revoke all on function public.mi_portfolio() from public;
grant execute on function public.portfolio_publico(uuid) to anon, authenticated;
grant execute on function public.mi_portfolio() to authenticated;
