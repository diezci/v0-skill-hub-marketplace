-- Corta el acceso directo a las columnas personales de `profiles`
-- (email, telefono, documento).
--
-- OJO CON EL ORDEN: aplicar esto ANTES de desplegar el código que usa
-- `contacto_perfiles` / `telefono_publico` (ver 042) rompe la web, porque las
-- consultas que aún pidan esas columnas fallarán con "permission denied".
-- Primero se despliega el código, después se aplica este archivo.
--
-- POR QUÉ ASÍ Y NO CON `REVOKE SELECT (columna)`:
-- en PostgreSQL los permisos de columna SUMAN, no restan. Si el rol tiene
-- SELECT sobre la tabla entera, revocar una columna suelta no hace absolutamente
-- nada (comprobado: `anon` seguía leyendo los 13 correos después de revocarlas).
-- La única forma es quitar el SELECT de tabla y volver a conceder, una por una,
-- solo las columnas que sí pueden verse.
--
-- INSERT y UPDATE se dejan como están: registrarse y editar el propio perfil
-- siguen escribiendo email, teléfono y documento con normalidad. Lo que se
-- corta es solo la LECTURA directa.
--
-- La RLS sigue dejando ver el resto del perfil (nombre, foto, ubicación...),
-- que es lo que necesita un marketplace público.

revoke select on public.profiles from anon, authenticated;

grant select (
  id,
  nombre,
  apellido,
  foto_perfil,
  foto_portada,
  ubicacion,
  bio,
  tipo_usuario,
  verificado,
  fecha_registro,
  ultima_conexion,
  created_at,
  updated_at,
  es_admin,
  empresa_id,
  cargo_empresa,
  email_notificaciones
) on public.profiles to anon, authenticated;

-- Recordatorio: si más adelante se añade una columna a `profiles`, NO será
-- legible hasta que se añada a este grant. Es el comportamiento que queremos
-- (por defecto privada), pero conviene tenerlo presente.
