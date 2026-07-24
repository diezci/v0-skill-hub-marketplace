-- Categoría "Otros" como cajón de sastre para servicios que no encajan en las
-- 7 categorías de la taxonomía (lib/categorias.ts). Es una subcategoría más,
-- seleccionable en el formulario de demanda y en la cobertura del profesional.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

insert into categorias (nombre, descripcion)
select 'Otros', 'servicios no incluidos en las demás categorías'
where not exists (select 1 from categorias c where c.nombre = 'Otros');
