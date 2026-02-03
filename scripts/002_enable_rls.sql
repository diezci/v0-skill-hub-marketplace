-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseñas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transacciones_escrow ENABLE ROW LEVEL SECURITY;

-- Políticas para profiles
CREATE POLICY "Usuarios pueden ver todos los perfiles públicos" 
  ON public.profiles FOR SELECT 
  USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Usuarios pueden insertar su propio perfil" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Políticas para profesionales
CREATE POLICY "Todos pueden ver profesionales" 
  ON public.profesionales FOR SELECT 
  USING (true);

CREATE POLICY "Profesionales pueden actualizar su perfil" 
  ON public.profesionales FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Profesionales pueden crear su perfil" 
  ON public.profesionales FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Políticas para categorías (solo lectura)
CREATE POLICY "Todos pueden ver categorías" 
  ON public.categorias FOR SELECT 
  USING (true);

-- Políticas para solicitudes
CREATE POLICY "Todos pueden ver solicitudes abiertas" 
  ON public.solicitudes FOR SELECT 
  USING (estado = 'abierta' OR auth.uid() = cliente_id);

CREATE POLICY "Clientes pueden crear solicitudes" 
  ON public.solicitudes FOR INSERT 
  WITH CHECK (auth.uid() = cliente_id);

CREATE POLICY "Clientes pueden actualizar sus solicitudes" 
  ON public.solicitudes FOR UPDATE 
  USING (auth.uid() = cliente_id);

CREATE POLICY "Clientes pueden eliminar sus solicitudes" 
  ON public.solicitudes FOR DELETE 
  USING (auth.uid() = cliente_id);

-- Políticas para ofertas
CREATE POLICY "Clientes y profesionales pueden ver ofertas relacionadas" 
  ON public.ofertas FOR SELECT 
  USING (
    auth.uid() = profesional_id OR 
    auth.uid() IN (SELECT cliente_id FROM public.solicitudes WHERE id = solicitud_id)
  );

CREATE POLICY "Profesionales pueden crear ofertas" 
  ON public.ofertas FOR INSERT 
  WITH CHECK (auth.uid() = profesional_id);

CREATE POLICY "Profesionales pueden actualizar sus ofertas" 
  ON public.ofertas FOR UPDATE 
  USING (auth.uid() = profesional_id);

-- Políticas para trabajos
CREATE POLICY "Usuarios pueden ver sus trabajos" 
  ON public.trabajos FOR SELECT 
  USING (auth.uid() = cliente_id OR auth.uid() = profesional_id);

CREATE POLICY "Sistema puede crear trabajos" 
  ON public.trabajos FOR INSERT 
  WITH CHECK (auth.uid() = cliente_id OR auth.uid() = profesional_id);

CREATE POLICY "Participantes pueden actualizar trabajos" 
  ON public.trabajos FOR UPDATE 
  USING (auth.uid() = cliente_id OR auth.uid() = profesional_id);

-- Políticas para portfolio
CREATE POLICY "Todos pueden ver portfolio visible" 
  ON public.portfolio FOR SELECT 
  USING (visible = true OR auth.uid() = profesional_id);

CREATE POLICY "Profesionales pueden gestionar su portfolio" 
  ON public.portfolio FOR ALL 
  USING (auth.uid() = profesional_id);

-- Políticas para reseñas
CREATE POLICY "Todos pueden ver reseñas" 
  ON public.reseñas FOR SELECT 
  USING (true);

CREATE POLICY "Clientes pueden crear reseñas" 
  ON public.reseñas FOR INSERT 
  WITH CHECK (auth.uid() = autor_id);

-- Políticas para conversaciones
CREATE POLICY "Usuarios pueden ver sus conversaciones" 
  ON public.conversaciones FOR SELECT 
  USING (auth.uid() = participante_1 OR auth.uid() = participante_2);

CREATE POLICY "Usuarios pueden crear conversaciones" 
  ON public.conversaciones FOR INSERT 
  WITH CHECK (auth.uid() = participante_1 OR auth.uid() = participante_2);

-- Políticas para mensajes
CREATE POLICY "Usuarios pueden ver mensajes de sus conversaciones" 
  ON public.mensajes FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT participante_1 FROM public.conversaciones WHERE id = conversacion_id
      UNION
      SELECT participante_2 FROM public.conversaciones WHERE id = conversacion_id
    )
  );

CREATE POLICY "Usuarios pueden enviar mensajes en sus conversaciones" 
  ON public.mensajes FOR INSERT 
  WITH CHECK (auth.uid() = remitente_id);

CREATE POLICY "Usuarios pueden actualizar mensajes (marcar como leído)" 
  ON public.mensajes FOR UPDATE 
  USING (
    auth.uid() IN (
      SELECT participante_1 FROM public.conversaciones WHERE id = conversacion_id
      UNION
      SELECT participante_2 FROM public.conversaciones WHERE id = conversacion_id
    )
  );

-- Políticas para transacciones escrow
CREATE POLICY "Usuarios pueden ver sus transacciones" 
  ON public.transacciones_escrow FOR SELECT 
  USING (auth.uid() = cliente_id OR auth.uid() = profesional_id);

CREATE POLICY "Sistema puede gestionar transacciones" 
  ON public.transacciones_escrow FOR ALL 
  USING (auth.uid() = cliente_id OR auth.uid() = profesional_id);
