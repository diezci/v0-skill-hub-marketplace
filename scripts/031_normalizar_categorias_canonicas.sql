-- Normaliza la tabla `categorias` a las 19 categorías canónicas de
-- lib/categorias.ts (CATEGORIAS_SERVICIO_NOMBRES), que son las que usan el
-- "Tipo de Servicio" del homepage, el formulario de publicar demanda, el filtro
-- de /profesionales y ahora también el filtro de /demandas.
--
-- Antes había sinónimos mezclados (Fontanería vs Fontanero, Pintura vs Pintor,
-- Jardinería y Jardinero duplicados...), así que filtrar /demandas por una
-- categoría canónica no encontraba las demandas guardadas con el sinónimo.
--
-- Solo `solicitudes.categoria_id` referencia `categorias`, así que repuntar las
-- demandas y borrar las filas sobrantes es seguro.

-- 1) Asegurar que existen las 19 categorías canónicas.
insert into categorias (nombre)
select v.nombre from (values
  ('Arquitecto'),('Diseñador de Interiores'),('Contratista'),('Albañil'),
  ('Carpintero'),('Fontanero'),('Electricista'),('Pintor'),('Yesero/Pladurista'),
  ('Instalador de Suelos'),('Climatización'),('Cerrajero'),('Marmolista'),
  ('Instalador de Ventanas'),('Ebanista'),('Tapicero'),('Jardinero'),
  ('Domótica'),('Impermeabilizaciones')
) as v(nombre)
where not exists (select 1 from categorias c where lower(c.nombre) = lower(v.nombre));

-- 2) Repuntar las demandas de categorías sinónimas a su canónica.
update solicitudes s
set categoria_id = canon.id
from categorias syn
join lateral (
  select c.id from categorias c where c.nombre = case syn.nombre
    when 'Fontanería' then 'Fontanero'
    when 'Pintura' then 'Pintor'
    when 'Pintura y Decoración' then 'Pintor'
    when 'Carpintería' then 'Carpintero'
    when 'Cerrajería' then 'Cerrajero'
    when 'Electricidad' then 'Electricista'
    when 'Jardinería' then 'Jardinero'
    when 'Albañilería' then 'Albañil'
    when 'Arquitectura' then 'Arquitecto'
    when 'Interiorismo' then 'Diseñador de Interiores'
    when 'Reformas Integrales' then 'Contratista'
    when 'Cristalería' then 'Instalador de Ventanas'
    when 'Pavimentación' then 'Instalador de Suelos'
    when 'Techado' then 'Impermeabilizaciones'
  end limit 1
) canon on true
where s.categoria_id = syn.id;

-- 3) Borrar todas las categorías fuera de la lista canónica (ya huérfanas).
delete from categorias c
where c.nombre not in (
  'Arquitecto','Diseñador de Interiores','Contratista','Albañil','Carpintero',
  'Fontanero','Electricista','Pintor','Yesero/Pladurista','Instalador de Suelos',
  'Climatización','Cerrajero','Marmolista','Instalador de Ventanas','Ebanista',
  'Tapicero','Jardinero','Domótica','Impermeabilizaciones'
)
and not exists (select 1 from solicitudes s where s.categoria_id = c.id);
