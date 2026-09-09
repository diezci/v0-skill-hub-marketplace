-- Cierra únicamente un duplicado técnico pendiente SIN intentos de pago ni
-- disputas, cuando su único hermano contractual ya consta completado y pagado.
-- Conserva ambas filas, los términos, la oferta/demanda y cada céntimo del
-- historial. No interpreta ni certifica movimientos antiguos de Stripe.
do $$
declare
  demanda_uuid uuid;
  duplicado_uuid uuid;
begin
  for demanda_uuid in
    select distinct t.solicitud_id from public.trabajos t
    where t.estado = 'pendiente_pago' and t.solicitud_id is not null and t.oferta_id is not null
      and not exists (select 1 from public.transacciones_escrow e where e.trabajo_id = t.id)
      and not exists (select 1 from public.disputas d where d.trabajo_id = t.id)
    order by t.solicitud_id
  loop
    -- Revalida después de adquirir los mismos bloqueos que pagos/contratación.
    perform 1 from public.solicitudes where id = demanda_uuid for update;
    perform 1 from public.trabajos where solicitud_id = demanda_uuid order by id for update;
    perform 1 from public.transacciones_escrow e join public.trabajos t on t.id = e.trabajo_id
      where t.solicitud_id = demanda_uuid order by e.id for update of e;
    perform 1 from public.disputas d join public.trabajos t on t.id = d.trabajo_id
      where t.solicitud_id = demanda_uuid order by d.id for update of d;

    for duplicado_uuid in
      select duplicado.id from public.trabajos duplicado
      join public.trabajos terminado on terminado.solicitud_id = duplicado.solicitud_id
        and terminado.id <> duplicado.id and terminado.estado = 'completado'
        and terminado.oferta_id = duplicado.oferta_id
        and terminado.cliente_id = duplicado.cliente_id
        and terminado.profesional_id = duplicado.profesional_id
        and terminado.precio_acordado = duplicado.precio_acordado
        and terminado.titulo is not distinct from duplicado.titulo
        and terminado.descripcion is not distinct from duplicado.descripcion
        and terminado.ubicacion is not distinct from duplicado.ubicacion
        and abs(extract(epoch from duplicado.created_at - terminado.created_at)) <= 60
      where duplicado.solicitud_id = demanda_uuid and duplicado.estado = 'pendiente_pago'
        and duplicado.cancelacion_estado is null
        and not exists (select 1 from public.transacciones_escrow e where e.trabajo_id = duplicado.id)
        and not exists (select 1 from public.disputas d where d.trabajo_id = duplicado.id)
        and (select count(*) from public.trabajos t where t.solicitud_id = demanda_uuid
          and t.estado is distinct from 'cancelado') = 2
        and (select count(*) from public.transacciones_escrow e where e.trabajo_id = terminado.id
          and e.estado is distinct from 'cancelado') = 1
        and exists (select 1 from public.transacciones_escrow e where e.trabajo_id = terminado.id
          and e.estado = 'completado' and e.liquidacion_estado = 'completada'
          and e.cliente_id = terminado.cliente_id and e.profesional_id = terminado.profesional_id
          and e.stripe_payment_intent_id is not null and e.fecha_retencion is not null
          and e.stripe_disputa_id is null
          and e.fecha_liberacion is not null and e.monto_base = terminado.precio_acordado
          and e.monto = e.monto_base + e.comision_cliente
          and e.pago_neto_proveedor + e.comision_proveedor = e.monto_base
          and coalesce(e.monto_reembolsado, 0) = 0)
    loop
      update public.trabajos set estado = 'cancelado', fecha_fin = coalesce(fecha_fin, current_date), updated_at = now()
        where id = duplicado_uuid and estado = 'pendiente_pago';
      raise notice 'Duplicado técnico sin pago conservado y cerrado: %', duplicado_uuid;
    end loop;
  end loop;
end;
$$;
