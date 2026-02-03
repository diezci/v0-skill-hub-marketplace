-- Script para crear solicitudes y ofertas de ejemplo
-- Ejecuta este script después del 005 para tener datos de prueba

-- Crear un perfil cliente de ejemplo si no existe
INSERT INTO profiles (id, nombre, apellido, email, ubicacion, telefono, tipo_usuario, foto_perfil)
VALUES ('00000000-0000-0000-0000-000000000099', 'Laura', 'Pérez', 'laura.perez@example.com', 'Madrid, España', '+34 678 901 234', 'cliente', 'https://randomuser.me/api/portraits/women/44.jpg')
ON CONFLICT (id) DO NOTHING;

-- Obtener IDs de categorías
DO $$
DECLARE
    cat_albanileria UUID;
    cat_fontaneria UUID;
    cat_electricidad UUID;
    cat_pintura UUID;
    cat_carpinteria UUID;
    cat_climatizacion UUID;
    cliente_id UUID := '00000000-0000-0000-0000-000000000099';
    prof_carlos UUID := '00000000-0000-0000-0000-000000000001';
    prof_miguel UUID := '00000000-0000-0000-0000-000000000002';
    prof_javier UUID := '00000000-0000-0000-0000-000000000003';
    prof_antonio UUID := '00000000-0000-0000-0000-000000000004';
    sol1_id UUID;
    sol2_id UUID;
    sol3_id UUID;
    sol4_id UUID;
BEGIN
    -- Obtener IDs de categorías
    SELECT id INTO cat_albanileria FROM categorias WHERE nombre = 'Albañilería' LIMIT 1;
    SELECT id INTO cat_fontaneria FROM categorias WHERE nombre = 'Fontanería' LIMIT 1;
    SELECT id INTO cat_electricidad FROM categorias WHERE nombre = 'Electricidad' LIMIT 1;
    SELECT id INTO cat_pintura FROM categorias WHERE nombre = 'Pintura' LIMIT 1;
    SELECT id INTO cat_carpinteria FROM categorias WHERE nombre = 'Carpintería' LIMIT 1;
    SELECT id INTO cat_climatizacion FROM categorias WHERE nombre = 'Climatización' LIMIT 1;

    -- Insertar solicitudes de ejemplo
    
    -- Solicitud 1: Reforma de baño completo
    INSERT INTO solicitudes (id, cliente_id, categoria_id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, estado, fecha_necesaria)
    VALUES (
        gen_random_uuid(),
        cliente_id,
        cat_albanileria,
        'Reforma integral de baño completo',
        'Necesito una reforma completa del baño principal de mi vivienda. Incluye alicatado de paredes y suelo, cambio de sanitarios, plato de ducha y mamparas. El baño tiene aproximadamente 6m². Me gustaría incluir materiales de gama media-alta.',
        'Madrid, Salamanca',
        4500.00,
        6500.00,
        'media',
        'abierta',
        CURRENT_DATE + INTERVAL '30 days'
    )
    RETURNING id INTO sol1_id;

    -- Solicitud 2: Instalación de aire acondicionado
    INSERT INTO solicitudes (id, cliente_id, categoria_id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, estado, fecha_necesaria)
    VALUES (
        gen_random_uuid(),
        cliente_id,
        cat_climatizacion,
        'Instalación de aire acondicionado split 3x1',
        'Busco profesional para instalar un sistema de aire acondicionado tipo split 3x1 en mi piso. Son tres habitaciones estándar. Necesito asesoramiento sobre la potencia adecuada y marcas recomendadas. Incluye suministro e instalación.',
        'Madrid, Chamberí',
        2000.00,
        3000.00,
        'alta',
        'abierta',
        CURRENT_DATE + INTERVAL '15 days'
    )
    RETURNING id INTO sol2_id;

    -- Solicitud 3: Reparación urgente de fuga de agua
    INSERT INTO solicitudes (id, cliente_id, categoria_id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, estado, fecha_necesaria)
    VALUES (
        gen_random_uuid(),
        cliente_id,
        cat_fontaneria,
        'URGENTE: Fuga de agua en cocina',
        'Tengo una fuga de agua importante debajo del fregadero de la cocina. Necesito un fontanero con urgencia para revisar y reparar. Parece que puede ser una tubería rota. Disponibilidad inmediata.',
        'Madrid, Retiro',
        150.00,
        400.00,
        'urgente',
        'abierta',
        CURRENT_DATE + INTERVAL '1 day'
    )
    RETURNING id INTO sol3_id;

    -- Solicitud 4: Pintura interior piso
    INSERT INTO solicitudes (id, cliente_id, categoria_id, titulo, descripcion, ubicacion, presupuesto_min, presupuesto_max, urgencia, estado, fecha_necesaria)
    VALUES (
        gen_random_uuid(),
        cliente_id,
        cat_pintura,
        'Pintura interior de piso de 90m²',
        'Necesito pintar todo el interior de mi piso de 90m². Son 3 habitaciones, salón, cocina, baño y pasillo. Las paredes están en buen estado, solo necesitan lijado y pintura. Colores claros neutros. No incluye materiales, solo mano de obra.',
        'Madrid, Arganzuela',
        1200.00,
        1800.00,
        'baja',
        'abierta',
        CURRENT_DATE + INTERVAL '45 days'
    )
    RETURNING id INTO sol4_id;

    -- Insertar ofertas para las solicitudes
    
    -- Ofertas para Solicitud 1 (Reforma baño)
    INSERT INTO ofertas (solicitud_id, profesional_id, precio, tiempo_estimado, unidad_tiempo, descripcion, materiales_incluidos, condiciones_pago, estado)
    VALUES (
        sol1_id,
        prof_carlos,
        5200.00,
        3,
        'semanas',
        'Buenos días Laura, soy Carlos Rodríguez, albañil con más de 15 años de experiencia. He revisado tu solicitud y puedo realizar la reforma completa del baño. El presupuesto incluye: demolición del baño existente, instalación de nuevas tuberías si es necesario (coordinado con fontanero), alicatado completo con material de primera calidad, instalación de sanitarios y mamparas. Trabajo con las mejores marcas del mercado.',
        'Materiales incluidos: cemento cola alta calidad, lechada epoxy, juntas anti-moho. NO incluye sanitarios, grifería ni mamparas (puedo asesorar en la compra).',
        'Pago: 40% al inicio, 30% a mitad de obra, 30% al finalizar. Garantía de 2 años en mano de obra.',
        'enviada'
    );

    INSERT INTO ofertas (solicitud_id, profesional_id, precio, tiempo_estimado, unidad_tiempo, descripcion, materiales_incluidos, condiciones_pago, estado)
    VALUES (
        sol1_id,
        prof_antonio,
        4800.00,
        4,
        'semanas',
        'Hola Laura, soy Antonio López. Llevo 20 años dedicándome a reformas de baños. Puedo ofrecerte un presupuesto muy competitivo manteniendo la máxima calidad. Mi equipo y yo nos encargamos de todo el proceso.',
        'Incluye todos los materiales de alicatado y solado. Sanitarios y mamparas no incluidos.',
        'Pago: 50% al inicio, 50% al finalizar.',
        'enviada'
    );

    -- Ofertas para Solicitud 2 (Aire acondicionado)
    INSERT INTO ofertas (solicitud_id, profesional_id, precio, tiempo_estimado, unidad_tiempo, descripcion, materiales_incluidos, condiciones_pago, estado)
    VALUES (
        sol2_id,
        prof_carlos,
        2650.00,
        1,
        'semanas',
        'Hola, soy Roberto Sánchez, técnico certificado en climatización. Para tu instalación recomiendo un sistema Daikin 3x1 de 6000 frigorías totales, ideal para tu vivienda. Instalación profesional con garantía oficial de la marca.',
        'Incluye: Equipo Daikin 3MXM52N + 3 splits interiores, tubería de cobre, instalación completa, puesta en marcha y garantía 3 años.',
        'Pago: 50% al confirmar, 50% tras instalación y puesta en marcha.',
        'enviada'
    );

    -- Ofertas para Solicitud 3 (Fuga urgente)
    INSERT INTO ofertas (solicitud_id, profesional_id, precio, tiempo_estimado, unidad_tiempo, descripcion, materiales_incluidos, condiciones_pago, estado)
    VALUES (
        sol3_id,
        prof_miguel,
        180.00,
        3,
        'horas',
        'Hola Laura, soy Miguel Torres, fontanero profesional. Puedo ir hoy mismo a revisar la fuga. El precio incluye desplazamiento, diagnóstico y reparación si es algo sencillo. Si requiere cambio de tuberías importantes, te haría presupuesto aparte.',
        'Incluye desplazamiento, diagnóstico y reparación básica con materiales estándar.',
        'Pago al finalizar el servicio. Acepto efectivo y transferencia.',
        'enviada'
    );

    -- Ofertas para Solicitud 4 (Pintura)
    INSERT INTO ofertas (solicitud_id, profesional_id, precio, tiempo_estimado, unidad_tiempo, descripcion, materiales_incluidos, condiciones_pago, estado)
    VALUES (
        sol4_id,
        prof_antonio,
        1350.00,
        1,
        'semanas',
        'Buenos días Laura, soy Antonio, pintor profesional con 20 años de experiencia. Para tu piso de 90m² ofrezco un servicio completo: lijado, preparación de paredes, dos manos de pintura plástica lavable de alta calidad. Acabado perfecto garantizado.',
        'Solo mano de obra. Materiales (pintura, rodillos, cintas, etc.) no incluidos. Puedo asesorarte en la compra.',
        'Pago: 40% al inicio, 60% al finalizar. Garantía 1 año.',
        'enviada'
    );

    -- Actualizar contador de ofertas en solicitudes
    UPDATE solicitudes SET total_ofertas = 2 WHERE id = sol1_id;
    UPDATE solicitudes SET total_ofertas = 1 WHERE id = sol2_id;
    UPDATE solicitudes SET total_ofertas = 1 WHERE id = sol3_id;
    UPDATE solicitudes SET total_ofertas = 1 WHERE id = sol4_id;

END $$;
