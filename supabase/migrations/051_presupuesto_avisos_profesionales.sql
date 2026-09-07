-- Los profesionales ya filtran los avisos de demandas nuevas por servicio y
-- provincia. Estos dos extremos opcionales añaden el filtro por presupuesto.
-- NULL significa "sin límite"; por eso los perfiles existentes conservan el
-- comportamiento actual y continúan recibiendo demandas de cualquier importe.

alter table public.profesionales
  add column if not exists presupuesto_min_interes numeric(10, 2),
  add column if not exists presupuesto_max_interes numeric(10, 2);

alter table public.profesionales
  drop constraint if exists profesionales_presupuesto_interes_check;

alter table public.profesionales
  add constraint profesionales_presupuesto_interes_check check (
    (presupuesto_min_interes is null or presupuesto_min_interes between 0 and 100000)
    and (presupuesto_max_interes is null or presupuesto_max_interes between 0 and 100000)
    and (
      presupuesto_min_interes is null
      or presupuesto_max_interes is null
      or presupuesto_min_interes <= presupuesto_max_interes
    )
  );

comment on column public.profesionales.presupuesto_min_interes is
  'Presupuesto mínimo de las demandas nuevas que el profesional quiere recibir; NULL = sin mínimo.';
comment on column public.profesionales.presupuesto_max_interes is
  'Presupuesto máximo de las demandas nuevas que el profesional quiere recibir; NULL = sin máximo.';

-- La interfaz ya impedía estos rangos en las demandas, pero la acción podía
-- invocarse directamente. NOT VALID evita bloquear el despliegue si hubiera
-- una fila histórica defectuosa y, aun así, protege todas las altas y cambios
-- nuevos que alimentarán el filtro de avisos.
alter table public.solicitudes
  drop constraint if exists solicitudes_presupuesto_valido_check;

alter table public.solicitudes
  add constraint solicitudes_presupuesto_valido_check check (
    (presupuesto_min is null or presupuesto_min >= 0)
    and (presupuesto_max is null or presupuesto_max >= 0)
    and (
      presupuesto_min is null
      or presupuesto_max is null
      or presupuesto_min <= presupuesto_max
    )
  ) not valid;
