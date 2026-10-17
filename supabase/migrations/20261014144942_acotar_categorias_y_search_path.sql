-- Coincide con la taxonomía canónica de lib/categorias.ts.
-- Conserva el alta automática de una categoría válida que aún no esté sembrada.
-- Al añadir subcategorías al catálogo, actualizar esta política en su migración.
alter policy "Usuarios autenticados pueden crear categorías" on public.categorias
with check (nombre = any(array[
    'Reformas integrales',
    'Albañilería',
    'Demoliciones y desescombro',
    'Fachadas',
    'Tejados y cubiertas',
    'Fontanería',
    'Electricidad',
    'Climatización',
    'Instalación de gas',
    'Domótica e instalaciones inteligentes',
    'Pintura y decoración',
    'Carpintería',
    'Solados y alicatados',
    'Techos y falsos techos',
    'Ventanas y cerramientos',
    'Vidrio y cristalería a medida',
    'Cocinas',
    'Baños',
    'Aislamiento e impermeabilización',
    'Energía y eficiencia',
    'Detección de fugas y humedades',
    'Tratamiento de madera',
    'Cerrajería',
    'Accesibilidad',
    'Arquitectura e interiorismo',
    'Certificados y gestión de obra',
    'Limpieza',
    'Montaje de muebles',
    'Restauración y tapicería de muebles',
    '"Manitas" / pequeñas reparaciones',
    'Control de plagas',
    'Mudanzas, portes y guardamuebles',
    'Jardinería y poda',
    'Diseño de jardines y paisajismo',
    'Riego automático',
    'Piscinas',
    'Toldos, pérgolas y protección solar',
    'Vallados y cerramientos exteriores',
    'Mecánica general',
    'Chapa y pintura',
    'Neumáticos',
    'Lavado y detailing',
    'Asistencia en carretera',
    'Reparación de móviles y ordenadores',
    'Reparación de electrodomésticos',
    'Instalación de TV, antenas y fibra',
    'Soporte informático a domicilio',
    'Alarmas y videovigilancia',
    'Catering',
    'Fotografía y vídeo',
    'Música y DJ',
    'Decoración de eventos',
    'Animación infantil',
    'Arreglos de ropa y costura',
    'Modistas a medida',
    'Otros'
]::text[]));

-- Los cuerpos ya usan nombres de tabla cualificados; no cambian sus privilegios.
alter function public.update_solicitud_ofertas_count() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';
alter function public.update_incidencias_updated_at() set search_path = '';
alter function public.update_profesional_rating() set search_path = '';
