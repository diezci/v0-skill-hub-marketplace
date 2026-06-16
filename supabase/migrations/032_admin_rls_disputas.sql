-- Acceso del rol admin (empleados Diime) para resolver disputas.
-- Aplicado el 2026-06-16.

-- Función helper: ¿el usuario actual es empleado de Diime?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select es_admin from public.profiles where id = auth.uid()), false);
$$;

-- Lectura para admins en todas las tablas implicadas en una disputa.
do $$
declare t text;
begin
  foreach t in array array['trabajos','transacciones_escrow','conversaciones','mensajes','actualizaciones_trabajo','solicitudes','ofertas','disputas'] loop
    execute format('drop policy if exists "Admins pueden ver todo" on public.%I', t);
    execute format('create policy "Admins pueden ver todo" on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Escritura para admins donde la resolución de disputas mueve fondos/estados.
do $$
declare t text;
begin
  foreach t in array array['trabajos','transacciones_escrow','solicitudes','disputas'] loop
    execute format('drop policy if exists "Admins pueden actualizar" on public.%I', t);
    execute format('create policy "Admins pueden actualizar" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
