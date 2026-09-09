-- Diagnóstico exclusivamente de lectura, antes de desplegar la contratación
-- atómica. No elimina trabajos ni intenta decidir qué cobro conservar.

-- Demandas con varios contratos no cancelados: se deben conciliar manualmente.
select 'contratos_duplicados' as incidencia, solicitud_id,
       jsonb_agg(jsonb_build_object('trabajo_id', id, 'oferta_id', oferta_id,
         'estado', estado, 'created_at', created_at) order by created_at) as detalle
from public.trabajos
where solicitud_id is not null and estado is distinct from 'cancelado'
group by solicitud_id having count(*) > 1;

-- Enlaces o importes que no coinciden con el acuerdo original.
select 'contrato_inconsistente' as incidencia, t.id as trabajo_id,
       t.solicitud_id, t.oferta_id, t.estado
from public.trabajos t
left join public.ofertas o on o.id = t.oferta_id
left join public.solicitudes s on s.id = t.solicitud_id
where o.id is null or s.id is null or o.solicitud_id is distinct from s.id
   or t.cliente_id is distinct from s.cliente_id
   or t.profesional_id is distinct from o.profesional_id
   or t.cliente_id = t.profesional_id
   or t.precio_acordado is distinct from o.precio;

-- Contratos cancelados con un intento o movimiento económico aún sin cerrar.
select 'cancelado_con_pago_activo' as incidencia, t.id as trabajo_id,
       e.id as transaccion_id, e.estado as estado_pago,
       e.fecha_retencion, e.stripe_payment_intent_id
from public.trabajos t join public.transacciones_escrow e on e.trabajo_id = t.id
where t.estado = 'cancelado'
  and e.estado in ('pendiente','retenido','fondos_retenidos','liquidando','disputa','pago_tardio');

-- Aceptaciones antiguas que no tienen contrato y no deben reabrirse sin revisar.
select 'oferta_aceptada_sin_contrato' as incidencia, o.id as oferta_id, o.solicitud_id
from public.ofertas o where o.estado = 'aceptada'
  and not exists (select 1 from public.trabajos t where t.oferta_id = o.id);
