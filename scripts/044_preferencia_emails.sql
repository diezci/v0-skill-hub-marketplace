-- Preferencia para dejar de recibir avisos por correo.
--
-- Por defecto activada: los avisos que se mandan son los que la persona espera
-- recibir (le han hecho una oferta, ha cobrado, le han abierto una disputa), y
-- siempre lleva enlace de baja en el pie del correo, como exige el RGPD.

alter table public.profiles
  add column if not exists email_notificaciones boolean not null default true;

comment on column public.profiles.email_notificaciones is
  'Si es false, esta persona no recibe avisos por correo (sí los sigue viendo en la web).';
