-- Nueva taxonomía de servicios (ver lib/categorias.ts, fuente única en la UI):
-- 7 categorías principales; "Reformas y Construcción" agrupa 24 subcategorías
-- en 6 bloques y el resto queda a 2 niveles. La unidad seleccionable (lo que
-- guarda solicitudes.categoria_id) es la SUBCATEGORÍA: la tabla categorias
-- pasa a contener las 53 subcategorías, con su detalle como descripción.
-- La jerarquía (categoría/bloque) vive solo en la UI.
--
-- Las 19 categorías antiguas por oficio ("Fontanero", "Pintor"...) se
-- sustituyen: cada demanda existente se repunta a la subcategoría equivalente
-- y después se borran las filas antiguas. solicitudes.categoria_id tiene FK
-- NO ACTION, así que si quedara alguna demanda sin repuntar el DELETE final
-- fallaría en vez de dejar datos rotos.
--
-- Aplicada ya en producción; queda versionada para reproducibilidad.

-- 1) Insertar las subcategorías que no existan (por nombre)
insert into categorias (nombre, descripcion)
select v.nombre, v.descripcion
from (values
  -- Reformas y Construcción · Estructura y obra civil
  ('Reformas integrales', 'vivienda completa, reforma parcial, locales y oficinas'),
  ('Albañilería', 'tabiquería, muros, enlucidos, obra menor'),
  ('Demoliciones y desescombro', 'retirada de escombros, contenedores, vaciados'),
  ('Fachadas', 'rehabilitación, SATE, revestimientos'),
  ('Tejados y cubiertas', 'reparación, canalones, tejas'),
  -- Reformas y Construcción · Instalaciones técnicas
  ('Fontanería', 'instalación, averías y fugas, calentadores/termos, saneamiento'),
  ('Electricidad', 'instalaciones, boletines, cuadros eléctricos, iluminación'),
  ('Climatización', 'aire acondicionado, calefacción, calderas, suelo radiante'),
  ('Instalación de gas', 'calderas, butano/propano, boletines de gas'),
  ('Domótica e instalaciones inteligentes', 'automatización del hogar, seguridad integrada'),
  -- Reformas y Construcción · Acabados e interiorismo
  ('Pintura y decoración', 'interior, exterior, papel pintado, estucos, microcemento'),
  ('Carpintería', 'madera a medida, puertas, armarios empotrados, PVC, aluminio'),
  ('Solados y alicatados', 'suelos (parquet, tarima, gres, mármol), azulejos'),
  ('Techos y falsos techos', 'pladur, escayola, techos técnicos'),
  ('Ventanas y cerramientos', 'PVC, aluminio, climalit, persianas, mosquiteras'),
  ('Vidrio y cristalería a medida', 'mamparas, espejos, vidrio de seguridad'),
  ('Cocinas', 'diseño, montaje, encimeras, electrodomésticos integrados'),
  ('Baños', 'diseño, platos de ducha, mamparas, sanitarios y grifería'),
  -- Reformas y Construcción · Aislamiento, eficiencia y patologías
  ('Aislamiento e impermeabilización', 'térmico, acústico, cubiertas, terrazas, humedades'),
  ('Energía y eficiencia', 'placas solares, aerotermia, mejora de calificación energética'),
  ('Detección de fugas y humedades', 'cámara termográfica, diagnóstico previo'),
  ('Tratamiento de madera', 'carcoma, termitas'),
  -- Reformas y Construcción · Seguridad y accesibilidad
  ('Cerrajería', 'cerraduras, puertas blindadas/acorazadas, rejas y vallado'),
  ('Accesibilidad', 'ascensores, salvaescaleras, rampas'),
  -- Reformas y Construcción · Proyecto y gestión
  ('Arquitectura e interiorismo', 'proyectos, planos, dirección de obra, render 3D'),
  ('Certificados y gestión de obra', 'certificado energético, licencia de obra, ITE, cédula de habitabilidad'),
  -- Hogar y mantenimiento
  ('Limpieza', 'hogar, oficinas, fin de obra, cristales, tapicerías'),
  ('Montaje de muebles', null),
  ('Restauración y tapicería de muebles', null),
  ('"Manitas" / pequeñas reparaciones', null),
  ('Control de plagas', null),
  ('Mudanzas, portes y guardamuebles', null),
  -- Exteriores y jardín
  ('Jardinería y poda', null),
  ('Diseño de jardines y paisajismo', null),
  ('Riego automático', null),
  ('Piscinas', 'construcción, reforma y mantenimiento'),
  ('Toldos, pérgolas y protección solar', null),
  ('Vallados y cerramientos exteriores', null),
  -- Automoción
  ('Mecánica general', null),
  ('Chapa y pintura', null),
  ('Neumáticos', null),
  ('Lavado y detailing', null),
  ('Asistencia en carretera', null),
  -- Tecnología y electrónica
  ('Reparación de móviles y ordenadores', null),
  ('Reparación de electrodomésticos', null),
  ('Instalación de TV, antenas y fibra', null),
  ('Soporte informático a domicilio', null),
  ('Alarmas y videovigilancia', null),
  -- Eventos
  ('Catering', null),
  ('Fotografía y vídeo', null),
  ('Música y DJ', null),
  ('Decoración de eventos', null),
  ('Animación infantil', null),
  -- Moda y textil
  ('Arreglos de ropa y costura', null),
  ('Modistas a medida', null)
) as v(nombre, descripcion)
where not exists (select 1 from categorias c where c.nombre = v.nombre);

-- 2) "Climatización" ya existía: actualizar su descripción a la de la taxonomía
update categorias set descripcion = 'aire acondicionado, calefacción, calderas, suelo radiante'
where nombre = 'Climatización';

-- 3) Repuntar las demandas de cada categoría antigua a su subcategoría equivalente
update solicitudes s
set categoria_id = nueva.id
from categorias vieja
join (values
  ('Arquitecto', 'Arquitectura e interiorismo'),
  ('Diseñador de Interiores', 'Arquitectura e interiorismo'),
  ('Contratista', 'Reformas integrales'),
  ('Albañil', 'Albañilería'),
  ('Carpintero', 'Carpintería'),
  ('Fontanero', 'Fontanería'),
  ('Electricista', 'Electricidad'),
  ('Pintor', 'Pintura y decoración'),
  ('Yesero/Pladurista', 'Techos y falsos techos'),
  ('Instalador de Suelos', 'Solados y alicatados'),
  ('Cerrajero', 'Cerrajería'),
  ('Marmolista', 'Solados y alicatados'),
  ('Instalador de Ventanas', 'Ventanas y cerramientos'),
  ('Ebanista', 'Carpintería'),
  ('Tapicero', 'Restauración y tapicería de muebles'),
  ('Jardinero', 'Jardinería y poda'),
  ('Domótica', 'Domótica e instalaciones inteligentes'),
  ('Impermeabilizaciones', 'Aislamiento e impermeabilización')
) as m(nombre_viejo, nombre_nuevo) on vieja.nombre = m.nombre_viejo
join categorias nueva on nueva.nombre = m.nombre_nuevo
where s.categoria_id = vieja.id;

-- 4) Borrar las categorías antiguas (si quedara una demanda sin repuntar, la FK lo impide)
delete from categorias where nombre in (
  'Arquitecto', 'Diseñador de Interiores', 'Contratista', 'Albañil', 'Carpintero',
  'Fontanero', 'Electricista', 'Pintor', 'Yesero/Pladurista', 'Instalador de Suelos',
  'Cerrajero', 'Marmolista', 'Instalador de Ventanas', 'Ebanista', 'Tapicero',
  'Jardinero', 'Domótica', 'Impermeabilizaciones'
);
