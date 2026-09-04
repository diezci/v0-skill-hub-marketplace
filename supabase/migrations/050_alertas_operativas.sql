-- Registro técnico agregado para fallos que deben revisar los administradores.
-- No contiene tokens, claves, cuerpos de mensajes ni datos personales completos.

create table if not exists public.eventos_operativos (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('stripe', 'liquidaciones', 'email', 'push', 'moderacion', 'sistema')),
  severidad text not null check (severidad in ('aviso', 'critica')),
  codigo text not null,
  clave text not null default 'global',
  mensaje text not null,
  contexto jsonb not null default '{}'::jsonb,
  estado text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  ocurrencias integer not null default 1 check (ocurrencias > 0),
  primer_evento_at timestamptz not null default now(),
  ultimo_evento_at timestamptz not null default now(),
  resuelto_at timestamptz,
  unique (area, codigo, clave)
);

create index if not exists eventos_operativos_estado_severidad_idx
  on public.eventos_operativos (estado, severidad, ultimo_evento_at desc);

alter table public.eventos_operativos enable row level security;
revoke all on table public.eventos_operativos from anon, authenticated;

create or replace function public.registrar_evento_operativo(
  p_area text,
  p_severidad text,
  p_codigo text,
  p_clave text,
  p_mensaje text,
  p_contexto jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  evento_id uuid;
begin
  insert into public.eventos_operativos (
    area, severidad, codigo, clave, mensaje, contexto
  ) values (
    p_area, p_severidad, p_codigo, coalesce(nullif(p_clave, ''), 'global'),
    p_mensaje, coalesce(p_contexto, '{}'::jsonb)
  )
  on conflict (area, codigo, clave) do update set
    severidad = excluded.severidad,
    mensaje = excluded.mensaje,
    contexto = excluded.contexto,
    estado = 'abierto',
    ocurrencias = public.eventos_operativos.ocurrencias + 1,
    ultimo_evento_at = now(),
    resuelto_at = null
  returning id into evento_id;

  return evento_id;
end;
$$;

revoke execute on function public.registrar_evento_operativo(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_evento_operativo(text, text, text, text, text, jsonb) to service_role;
