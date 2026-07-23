-- Los avisos de demandas nuevas se decidían por coincidencia de texto difusa
-- entre la categoría de la demanda y el título/habilidades del profesional
-- (substring o raíz de 5 letras). Eso avisaba a quien no tocaba y dejaba fuera
-- a quien sí, y además no miraba la ubicación: un fontanero de Málaga recibía
-- demandas de Girona.
--
-- Ahora el profesional declara explícitamente en qué SUBCATEGORÍAS de la
-- taxonomía (lib/categorias.ts) trabaja y qué PROVINCIAS cubre, y el aviso se
-- envía solo si la demanda encaja en ambas.
--
-- text[] para ser coherentes con `idiomas`, que ya es ARRAY en esta tabla. Los
-- valores válidos los valida la aplicación contra lib/categorias.ts y
-- lib/provincias.ts: la taxonomía evoluciona en código, así que no se fija con
-- un CHECK en la base de datos.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

alter table profesionales
  add column if not exists categorias_interes text[] not null default '{}',
  add column if not exists provincias_cobertura text[] not null default '{}';

-- Búsqueda por solapamiento (&&) al buscar destinatarios de una demanda.
create index if not exists profesionales_categorias_interes_idx
  on profesionales using gin (categorias_interes);
create index if not exists profesionales_provincias_cobertura_idx
  on profesionales using gin (provincias_cobertura);
