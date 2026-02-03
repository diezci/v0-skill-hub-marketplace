-- Insertar categorías de servicios
INSERT INTO public.categorias (nombre, descripcion, icono, color) VALUES
  ('Albañilería', 'Construcción, reformas, muros y estructuras', 'hammer', 'orange'),
  ('Fontanería', 'Instalación y reparación de tuberías, grifos y sistemas de agua', 'droplet', 'blue'),
  ('Electricidad', 'Instalaciones eléctricas, iluminación y sistemas de seguridad', 'zap', 'yellow'),
  ('Pintura', 'Pintura interior y exterior, acabados profesionales', 'paintbrush', 'pink'),
  ('Carpintería', 'Muebles a medida, puertas, ventanas y trabajos en madera', 'ruler', 'brown'),
  ('Climatización', 'Instalación y mantenimiento de aire acondicionado y calefacción', 'wind', 'cyan'),
  ('Jardinería', 'Diseño, mantenimiento y cuidado de jardines', 'leaf', 'green'),
  ('Cerrajería', 'Cambio de cerraduras, apertura de puertas y sistemas de seguridad', 'key', 'gray'),
  ('Reformas Integrales', 'Proyectos completos de renovación y construcción', 'home', 'purple'),
  ('Arquitectura', 'Diseño arquitectónico y proyectos técnicos', 'drafting-compass', 'indigo'),
  ('Interiorismo', 'Diseño y decoración de interiores', 'palette', 'rose'),
  ('Cristalería', 'Instalación y reparación de cristales y ventanas', 'panel-top', 'sky'),
  ('Limpieza', 'Servicios de limpieza profesional', 'sparkles', 'teal'),
  ('Mudanzas', 'Servicios de mudanza y transporte', 'truck', 'amber'),
  ('Techado', 'Reparación e instalación de tejados', 'triangle', 'red'),
  ('Pavimentación', 'Instalación de suelos y pavimentos', 'square', 'stone'),
  ('Piscinas', 'Construcción y mantenimiento de piscinas', 'waves', 'blue'),
  ('Energía Solar', 'Instalación de paneles solares y sistemas renovables', 'sun', 'yellow'),
  ('Domótica', 'Automatización y sistemas inteligentes para el hogar', 'cpu', 'violet')
ON CONFLICT (nombre) DO NOTHING;
