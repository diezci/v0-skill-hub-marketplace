-- Seed example professional profiles
-- Run this script to populate the database with example professionals

-- Insert example users into auth.users (this would normally be done through Supabase Auth)
-- For this script, we'll create the profiles and profesionales directly with generated UUIDs

-- Insert example profiles
INSERT INTO profiles (id, nombre, apellido, email, ubicacion, telefono, tipo_usuario, foto_perfil) VALUES
('00000000-0000-0000-0000-000000000001', 'Carlos', 'Rodríguez', 'carlos.rodriguez@example.com', 'Madrid, España', '+34 612 345 678', 'profesional', 'https://randomuser.me/api/portraits/men/32.jpg'),
('00000000-0000-0000-0000-000000000002', 'Miguel Ángel', 'Torres', 'miguel.torres@example.com', 'Barcelona, España', '+34 623 456 789', 'profesional', 'https://randomuser.me/api/portraits/men/45.jpg'),
('00000000-0000-0000-0000-000000000003', 'Javier', 'Martínez', 'javier.martinez@example.com', 'Valencia, España', '+34 634 567 890', 'profesional', 'https://randomuser.me/api/portraits/men/22.jpg'),
('00000000-0000-0000-0000-000000000004', 'Antonio', 'López', 'antonio.lopez@example.com', 'Sevilla, España', '+34 645 678 901', 'profesional', 'https://randomuser.me/api/portraits/men/56.jpg'),
('00000000-0000-0000-0000-000000000005', 'Francisco', 'Gómez', 'francisco.gomez@example.com', 'Bilbao, España', '+34 656 789 012', 'profesional', 'https://randomuser.me/api/portraits/men/76.jpg'),
('00000000-0000-0000-0000-000000000006', 'Roberto', 'Sánchez', 'roberto.sanchez@example.com', 'Málaga, España', '+34 667 890 123', 'profesional', 'https://randomuser.me/api/portraits/men/60.jpg');

-- Insert example profesionales
INSERT INTO profesionales (user_id, categoria_id, titulo, bio, habilidades, certificaciones, idiomas, tarifa_por_hora, tiempo_respuesta, anos_experiencia, total_trabajos, rating_promedio, verificado) VALUES
('00000000-0000-0000-0000-000000000001', 1, 'Maestro Albañil Especializado en Reformas Integrales', 
'Albañil profesional con más de 15 años de experiencia en reformas integrales de viviendas. Especializado en construcción de muros, alicatados, solados y rehabilitación de fachadas.', 
ARRAY['Albañilería', 'Reformas Integrales', 'Alicatado', 'Solado', 'Rehabilitación de Fachadas'], 
ARRAY['Certificado Profesional en Albañilería', 'PRL Construcción'], 
ARRAY['Español', 'Inglés Básico'], 
35, '2 horas', 15, 156, 4.9, true),

('00000000-0000-0000-0000-000000000002', 2, 'Fontanero Certificado - Instalaciones y Reparaciones',
'Fontanero profesional con certificación oficial en instalaciones de agua, gas y calefacción. Especializado en reparaciones urgentes, instalaciones completas y mantenimiento preventivo.',
ARRAY['Fontanería', 'Instalación de Calefacción', 'Reparación de Fugas', 'Instalación de Gas'],
ARRAY['Certificado Instalador de Gas', 'Carnet Profesional Fontanero'],
ARRAY['Español', 'Catalán', 'Inglés'],
40, '1 hora', 12, 289, 4.8, true),

('00000000-0000-0000-0000-000000000003', 3, 'Electricista Certificado - Instalaciones Residenciales y Comerciales',
'Electricista certificado con amplia experiencia en instalaciones eléctricas residenciales y comerciales. Especializado en domótica, sistemas de iluminación LED y energías renovables.',
ARRAY['Instalaciones Eléctricas', 'Domótica', 'Iluminación LED', 'Energía Solar'],
ARRAY['Carnet Instalador Electricista', 'Certificado REBT', 'Instalador Fotovoltaico'],
ARRAY['Español', 'Valenciano', 'Inglés'],
45, '1 hora', 18, 342, 4.9, true),

('00000000-0000-0000-0000-000000000004', 4, 'Pintor Profesional - Interior y Exterior',
'Pintor profesional con 20 años de experiencia en pintura interior y exterior. Especializado en acabados decorativos, estuco veneciano y pintura de fachadas.',
ARRAY['Pintura Interior', 'Pintura Exterior', 'Estuco Veneciano', 'Pintura Decorativa'],
ARRAY['Certificado Profesional Pintor', 'PRL Construcción'],
ARRAY['Español'],
30, '3 horas', 20, 178, 4.7, true),

('00000000-0000-0000-0000-000000000005', 5, 'Maestro Carpintero - Muebles a Medida',
'Maestro carpintero con más de 25 años de experiencia en diseño y fabricación de muebles a medida. Especializado en cocinas, armarios empotrados y mobiliario de alta calidad.',
ARRAY['Carpintería a Medida', 'Cocinas', 'Armarios Empotrados', 'Ebanistería'],
ARRAY['Maestro Carpintero', 'Certificado Profesional Ebanistería'],
ARRAY['Español', 'Euskera'],
50, '4 horas', 25, 134, 4.9, true),

('00000000-0000-0000-0000-000000000006', 6, 'Técnico en Climatización - Instalación y Mantenimiento',
'Técnico especializado en instalación y mantenimiento de sistemas de climatización. Instalador oficial de las principales marcas. Servicio de mantenimiento preventivo y reparaciones urgentes.',
ARRAY['Instalación Aire Acondicionado', 'Mantenimiento HVAC', 'Sistemas VRV', 'Aerotermia'],
ARRAY['Certificado Manipulador Gases Fluorados', 'Instalador Oficial Daikin'],
ARRAY['Español', 'Inglés'],
42, '2 horas', 14, 267, 4.8, true);

-- Insert example portfolio items
INSERT INTO portfolio (profesional_id, titulo, descripcion, imagen_url, categoria, fecha_completado, ubicacion, duracion, presupuesto) VALUES
((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000001'), 
'Reforma Integral Piso 120m²', 
'Reforma completa incluyendo derribos, tabiquería, alicatados y solados',
'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
'Reforma Integral', '2024-03-15', 'Madrid Centro', '6 semanas', 18000),

((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000002'),
'Instalación Completa Fontanería Vivienda',
'Instalación de fontanería completa en vivienda de nueva construcción',
'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
'Instalación', '2024-04-10', 'Barcelona', '8 semanas', 20000),

((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000003'),
'Instalación Eléctrica Completa Vivienda 180m²',
'Instalación eléctrica completa con sistema domótico integrado',
'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
'Instalación Completa', '2024-05-20', 'Valencia', '10 semanas', 22000);

-- Insert example reviews
INSERT INTO reviews (profesional_id, cliente_id, puntuacion, comentario, tipo_proyecto) VALUES
((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000001'),
'00000000-0000-0000-0000-000000000001',
5,
'Excelente profesional. Realizó la reforma de mi piso en el tiempo acordado y con un acabado impecable.',
'Reforma Integral'),

((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000002'),
'00000000-0000-0000-0000-000000000001',
5,
'Vino en menos de una hora para una urgencia. Solucionó la fuga rápidamente y dejó todo limpio.',
'Reparación Urgente'),

((SELECT id FROM profesionales WHERE user_id = '00000000-0000-0000-0000-000000000003'),
'00000000-0000-0000-0000-000000000001',
5,
'Javier es un profesional excepcional. La instalación domótica funciona perfectamente.',
'Instalación Domótica');
