-- Tabla de usuarios (perfiles públicos)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT,
  foto_perfil TEXT,
  foto_portada TEXT,
  telefono TEXT,
  ubicacion TEXT,
  bio TEXT,
  tipo_entidad TEXT CHECK (tipo_entidad IN ('particular', 'empresa')) DEFAULT 'particular',
  documento TEXT, -- DNI for particular, CIF for empresa
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
  verificado BOOLEAN DEFAULT false,
  fecha_registro TIMESTAMPTZ DEFAULT NOW(),
  ultima_conexion TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de empresas
CREATE TABLE IF NOT EXISTS public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cif TEXT NOT NULL UNIQUE,
  propietario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo TEXT,
  descripcion TEXT,
  ubicacion TEXT,
  telefono TEXT,
  email TEXT,
  sitio_web TEXT,
  token_invitacion TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  verificada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de información profesional
CREATE TABLE IF NOT EXISTS public.profesionales (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  tarifa_por_hora DECIMAL(10, 2),
  años_experiencia INTEGER,
  idiomas TEXT[],
  certificaciones JSONB DEFAULT '[]'::JSONB,
  habilidades JSONB DEFAULT '[]'::JSONB,
  disponible BOOLEAN DEFAULT true,
  rating_promedio DECIMAL(3, 2) DEFAULT 0,
  total_trabajos INTEGER DEFAULT 0,
  total_reseñas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de categorías de servicios
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  icono TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de solicitudes de servicios (demandas)
CREATE TABLE IF NOT EXISTS public.solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias(id),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  ubicacion TEXT NOT NULL,
  presupuesto_min DECIMAL(10, 2),
  presupuesto_max DECIMAL(10, 2),
  urgencia TEXT CHECK (urgencia IN ('baja', 'media', 'alta', 'urgente')) DEFAULT 'media',
  estado TEXT CHECK (estado IN ('abierta', 'en_progreso', 'completada', 'cancelada')) DEFAULT 'abierta',
  archivos JSONB DEFAULT '[]'::JSONB,
  fecha_necesaria DATE,
  total_ofertas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ofertas de profesionales
CREATE TABLE IF NOT EXISTS public.ofertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES public.solicitudes(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  precio DECIMAL(10, 2) NOT NULL,
  tiempo_estimado INTEGER NOT NULL,
  unidad_tiempo TEXT CHECK (unidad_tiempo IN ('horas', 'dias', 'semanas')) DEFAULT 'dias',
  descripcion TEXT NOT NULL,
  materiales_incluidos TEXT,
  condiciones_pago TEXT,
  notas TEXT,
  estado TEXT CHECK (estado IN ('enviada', 'aceptada', 'rechazada', 'en_negociacion', 'retirada')) DEFAULT 'enviada',
  archivos JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de trabajos/proyectos
CREATE TABLE IF NOT EXISTS public.trabajos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID REFERENCES public.solicitudes(id) ON DELETE SET NULL,
  oferta_id UUID REFERENCES public.ofertas(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  precio_acordado DECIMAL(10, 2) NOT NULL,
  estado TEXT CHECK (estado IN ('pendiente', 'en_progreso', 'completado', 'cancelado', 'en_disputa')) DEFAULT 'pendiente',
  fecha_inicio DATE,
  fecha_fin DATE,
  ubicacion TEXT,
  archivos JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de portfolio
CREATE TABLE IF NOT EXISTS public.portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  trabajo_id UUID REFERENCES public.trabajos(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  imagenes TEXT[],
  ubicacion TEXT,
  duracion TEXT,
  presupuesto DECIMAL(10, 2),
  fecha_proyecto DATE,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de reseñas
CREATE TABLE IF NOT EXISTS public.reseñas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comentario TEXT NOT NULL,
  tipo_proyecto TEXT,
  votos_utiles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS public.conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participante_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ultimo_mensaje TEXT,
  fecha_ultimo_mensaje TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participante_1, participante_2)
);

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS public.mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES public.conversaciones(id) ON DELETE CASCADE,
  remitente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  leido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de transacciones escrow
CREATE TABLE IF NOT EXISTS public.transacciones_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabajo_id UUID NOT NULL REFERENCES public.trabajos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profesional_id UUID NOT NULL REFERENCES public.profesionales(id) ON DELETE CASCADE,
  monto DECIMAL(10, 2) NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  estado TEXT CHECK (estado IN ('pendiente', 'retenido', 'liberado', 'reembolsado', 'cancelado')) DEFAULT 'pendiente',
  fecha_retencion TIMESTAMPTZ,
  fecha_liberacion TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_solicitudes_cliente ON public.solicitudes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_categoria ON public.solicitudes(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_solicitud ON public.ofertas(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_profesional ON public.ofertas(profesional_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON public.trabajos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_profesional ON public.trabajos(profesional_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_profesional ON public.portfolio(profesional_id);
CREATE INDEX IF NOT EXISTS idx_reseñas_profesional ON public.reseñas(profesional_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON public.mensajes(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_participantes ON public.conversaciones(participante_1, participante_2);
