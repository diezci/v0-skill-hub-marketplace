-- Moderacion obligatoria de demandas en la frontera de datos.
--
-- La aplicacion valida antes para poder dar feedback inmediato, pero un usuario
-- autenticado tambien puede llamar directamente a la API REST de Supabase. El
-- trigger impide que esa via se salte la politica. Las reglas viven en una
-- tabla cerrada a anon/authenticated para poder activarlas, reordenarlas o
-- ajustarlas desde una sesion administrativa sin volver a desplegar el schema.

create table if not exists public.moderacion_reglas_solicitudes (
  codigo text primary key,
  activa boolean not null default true,
  prioridad smallint not null default 100,
  descripcion_interna text not null,
  patron text not null,
  patron_exclusion text,
  motivo_usuario text not null,
  updated_at timestamptz not null default now(),
  constraint moderacion_reglas_codigo_formato
    check (codigo ~ '^[a-z0-9_]+$'),
  constraint moderacion_reglas_motivo_no_vacio
    check (length(trim(motivo_usuario)) > 0)
);

comment on table public.moderacion_reglas_solicitudes is
  'Reglas configurables que impiden publicar demandas claramente prohibidas.';
comment on column public.moderacion_reglas_solicitudes.patron is
  'Expresion regular PostgreSQL aplicada al texto normalizado sin tildes.';
comment on column public.moderacion_reglas_solicitudes.patron_exclusion is
  'Contexto legitimo que evita un falso positivo cuando coincide la regla.';

alter table public.moderacion_reglas_solicitudes enable row level security;
revoke all on table public.moderacion_reglas_solicitudes from anon, authenticated;

insert into public.moderacion_reglas_solicitudes
  (codigo, prioridad, descripcion_interna, patron, patron_exclusion, motivo_usuario)
values
  (
    'drogas_ilegales',
    10,
    'Compraventa, fabricacion o transporte de drogas inequivocamente ilegales.',
    $re$(\m(comprar|compra|vender|venta|distribuir|distribucion|transportar|transporte|fabricar|fabricacion|traficar|conseguir|entregar|buy|sell|distribute|transport|manufacture|traffic|deliver)\M.{0,60}\m(cocaina|heroina|metanfetamina|fentanilo|farlopa|drogas? ilegales?|cocaine|heroin|methamphetamine|fentanyl|illegal drugs?)\M)|(\m(cocaina|heroina|metanfetamina|fentanilo|farlopa|drogas? ilegales?|cocaine|heroin|methamphetamine|fentanyl|illegal drugs?)\M.{0,60}\m(comprar|compra|vender|venta|distribuir|distribucion|transportar|transporte|fabricar|fabricacion|traficar|conseguir|entregar|buy|sell|distribute|transport|manufacture|traffic|deliver)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir la compra, venta, fabricación o transporte de drogas ilegales.'
  ),
  (
    'violencia_contra_personas',
    20,
    'Contratacion o encargo explicito de agresiones, secuestro o asesinato.',
    $re$(\m(contratar|buscar|necesitar|pagar)\M.{0,45}\m(sicario|maton)\M)|(\m(matar|asesinar|agredir|secuestrar|torturar)\M.{0,45}(a )?(una? persona|alguien|mi pareja|mi expareja|mi vecino|mi vecina|mi jefe|mi jefa)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece encargar violencia, amenazas o daño contra una persona.'
  ),
  (
    'explotacion_sexual',
    30,
    'Explotacion sexual y contenido sexual de menores.',
    $re$(\m(crear|grabar|fotografiar|comprar|vender|distribuir|compartir|conseguir)\M.{0,60}\m(pornografia infantil|contenido sexual (de|con) menores?|imagenes? sexuales? de menores?)\M)|(\m(explotar|prostituir|captar)\M.{0,45}\m(menores?|ninos?|ninas?|persona contra su voluntad)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece implicar explotación sexual o contenido sexual de menores.'
  ),
  (
    'contenido_sexual_explicito',
    35,
    'Servicios o produccion sexual explicita prohibidos por las Normas de la comunidad.',
    $re$(\m(contratar|buscar|necesitar|ofrecer|grabar|fotografiar|crear|producir)\M.{0,55}\m(pornografia|servicios? sexuales?|prostitucion|sexo explicito)\M)|(\m(pornografia|servicios? sexuales?|prostitucion|sexo explicito)\M.{0,55}\m(contratar|buscar|necesitar|ofrecer|grabar|fotografiar|crear|producir)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece ofrecer o pedir servicios o contenido sexual explícito.'
  ),
  (
    'armas_y_explosivos',
    40,
    'Fabricacion de explosivos o comercio de armas expresamente irregulares.',
    $re$(\m(comprar|vender|conseguir|fabricar|montar|modificar|transportar|buy|sell|get|make|build|modify|transport)\M.{0,60}\m(bomba (casera|explosiva|molotov|con detonador)|homemade bomb|molotov cocktail|weapons? (without (a )?licen[cs]e|with (the )?serial number (removed|erased))|armas? (sin licencia|sin papeles|con el numero (de serie )?borrado))\M)|(\m(bomba (casera|explosiva|molotov|con detonador)|homemade bomb|molotov cocktail|weapons? (without (a )?licen[cs]e|with (the )?serial number (removed|erased))|armas? (sin licencia|sin papeles|con el numero (de serie )?borrado))\M.{0,60}\m(comprar|vender|conseguir|fabricar|montar|modificar|transportar|buy|sell|get|make|build|modify|transport)\M)|(\m(fabricar|montar)\M.{0,45}\mexplosivos?\M)|(\m(borrar|eliminar|alterar)\M.{0,35}\mnumero (de serie )?(de )?(un |una )?arma\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir armas ilegales o la fabricación de explosivos.'
  ),
  (
    'fraude_y_falsificacion',
    50,
    'Falsificacion documental, fraude de pagos o blanqueo.',
    $re$(\m(falsificar|falsear)\M.{0,55}\m(dni|nie|pasaporte|permiso de conducir|titulo academico|certificado|receta medica|factura|nomina|boletin electrico|boletin de gas|itv|passport|driving licen[cs]e|academic degree|certificate|medical prescription|invoice|payslip)\M)|(\m(fabricar|crear|conseguir|necesitar|buscar|comprar|encargar|hacer|obtener|make|create|need|find|buy|get|order)\M.{0,55}\m(dni|nie|pasaporte|permiso de conducir|titulo academico|certificado|receta medica|factura|nomina|boletin electrico|boletin de gas|itv|passport|driving licen[cs]e|academic degree|certificate|medical prescription|invoice|payslip)\M.{0,30}\m(fals[oa]s?|fraudulent[oa]s?|inventad[oa]s?|sin inspeccion|sin pasar|fake|forged|fraudulent|without inspection)\M)|(\m(fabricar|crear|conseguir|necesitar|buscar|comprar|encargar|hacer|obtener|make|create|need|find|buy|get|order)\M.{0,55}\m(fals[oa]s?|fraudulent[oa]s?|inventad[oa]s?|sin inspeccion|sin pasar|fake|forged|fraudulent|without inspection)\M.{0,30}\m(dni|nie|pasaporte|permiso de conducir|titulo academico|certificado|receta medica|factura|nomina|boletin electrico|boletin de gas|itv|passport|driving licen[cs]e|academic degree|certificate|medical prescription|invoice|payslip)\M)|(\mitv\M.{0,30}\m(sin inspeccion|sin pasar)\M)|(\m(blanquear|lavar) dinero\M)|(\m(cobrar|pagar|comprar)\M.{0,40}\m(tarjetas? robadas?|cuentas? bancarias? ajenas?)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir falsificación documental o fraude económico.'
  ),
  (
    'intrusion_informatica',
    60,
    'Acceso no autorizado, robo de credenciales, malware o denegacion de servicio.',
    $re$(\m(hackear|piratear|acceder|entrar)\M.{0,55}\m(cuenta|correo|email|whatsapp|instagram|movil|ordenador|wifi|red)\M.{0,45}\m(ajeno|ajena|sin permiso|sin autorizacion|sin que se entere)\M)|(\m(robar|capturar|conseguir)\M.{0,35}\m(contrasenas?|credenciales|claves de acceso)\M)|(\m(crear|instalar|distribuir|programar)\M.{0,35}\m(ransomware|malware|troyano|keylogger)\M)|(\m(hacer|lanzar|contratar)\M.{0,35}\m(ataque )?ddos\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir acceso informático no autorizado o software malicioso.'
  ),
  (
    'vigilancia_sin_consentimiento',
    70,
    'Vigilancia clandestina o software espia contra otra persona.',
    $re$(\m(instalar|ocultar|colocar)\M.{0,40}\m(camara|microfono|gps|spyware|keylogger)\M.{0,55}\m(sin permiso|sin consentimiento|sin que se entere|para espiar)\M)|(\m(espiar|vigilar|rastrear)\M.{0,40}(a )?(mi )?(pareja|expareja|empleado|empleada|vecino|vecina|otra persona)\M.{0,40}\m(sin permiso|sin consentimiento|sin que se entere)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir vigilancia o espionaje sin consentimiento.'
  ),
  (
    'residuos_ilegales',
    80,
    'Vertido o abandono deliberadamente irregular de residuos peligrosos.',
    $re$(\m(tirar|verter|abandonar|ocultar)\M.{0,45}\m(amianto|asbesto|residuos? toxicos?|escombros|aceite industrial)\M.{0,45}\m(sin permiso|sin gestor autorizado|ilegalmente|donde nadie lo vea)\M)|(\m(sin permiso|sin gestor autorizado|ilegalmente)\M.{0,45}\m(tirar|verter|abandonar)\M.{0,45}\m(amianto|asbesto|residuos? toxicos?|escombros|aceite industrial)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir el vertido ilegal de residuos o materiales peligrosos.'
  ),
  (
    'maltrato_animal',
    90,
    'Encargo explicito de dano a mascotas o animales de compania.',
    $re$(\m(matar|envenenar|torturar|herir)\M.{0,40}\m(perro|perra|gato|gata|mascota|animal de compania)\M)|(\m(perro|perra|gato|gata|mascota|animal de compania)\M.{0,40}\m(matar|envenenar|torturar|herir)\M)$re$,
    null,
    'No se puede publicar: la solicitud parece encargar maltrato o daño deliberado a un animal.'
  ),
  (
    'robo_y_bienes_robados',
    100,
    'Encargo de robo o manipulacion de bienes identificados como robados.',
    $re$(\m(robar|sustraer)\M.{0,45}\m(coche|moto|vehiculo|movil|ordenador|paquete|dinero|joyas?)\M)|(\m(vender|ocultar|desmontar|transportar|cambiar el imei)\M.{0,45}\m(coche|moto|vehiculo|movil|ordenador|joyas?) robad[oa]s?\M)$re$,
    null,
    'No se puede publicar: la solicitud parece pedir un robo o la manipulación de bienes robados.'
  )
on conflict (codigo) do update set
  prioridad = excluded.prioridad,
  descripcion_interna = excluded.descripcion_interna,
  patron = excluded.patron,
  patron_exclusion = excluded.patron_exclusion,
  motivo_usuario = excluded.motivo_usuario,
  updated_at = now();

create or replace function public.normalizar_texto_moderacion(valor text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  limpio text;
  resultado text := '';
  token text;
  letras text[] := array[]::text[];
begin
  limpio := pg_catalog.lower(valor);
  limpio := pg_catalog.translate(
    limpio,
    'áàäâãéèëêíìïîóòöôõúùüûñç013457@$',
    'aaaaaeeeeiiiiooooouuuuncoieastas'
  );
  limpio := pg_catalog.regexp_replace(limpio, '([a-z])\1{2,}', '\1', 'g');
  limpio := pg_catalog.regexp_replace(limpio, '[^a-z0-9]+', ' ', 'g');
  limpio := pg_catalog.btrim(pg_catalog.regexp_replace(limpio, '[[:space:]]+', ' ', 'g'));

  -- Reconstruye terminos ofuscados letra a letra. Las secuencias cortas se
  -- conservan separadas para no alterar expresiones normales como "a b".
  foreach token in array pg_catalog.string_to_array(limpio, ' ')
  loop
    if pg_catalog.length(token) = 1 then
      letras := pg_catalog.array_append(letras, token);
    else
      if pg_catalog.cardinality(letras) >= 4 then
        resultado := resultado || ' ' || pg_catalog.array_to_string(letras, '');
      elsif pg_catalog.cardinality(letras) > 0 then
        resultado := resultado || ' ' || pg_catalog.array_to_string(letras, ' ');
      end if;
      letras := array[]::text[];
      resultado := resultado || ' ' || token;
    end if;
  end loop;

  if pg_catalog.cardinality(letras) >= 4 then
    resultado := resultado || ' ' || pg_catalog.array_to_string(letras, '');
  elsif pg_catalog.cardinality(letras) > 0 then
    resultado := resultado || ' ' || pg_catalog.array_to_string(letras, ' ');
  end if;

  return pg_catalog.btrim(pg_catalog.regexp_replace(resultado, '[[:space:]]+', ' ', 'g'));
end;
$$;

create or replace function public.comprobar_moderacion_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  texto_normalizado text;
  categoria_nombre text := '';
  regla record;
begin
  if tg_op = 'UPDATE'
    and new.titulo is not distinct from old.titulo
    and new.descripcion is not distinct from old.descripcion
    and new.categoria_id is not distinct from old.categoria_id
    and new.ubicacion is not distinct from old.ubicacion
  then
    return new;
  end if;

  if new.categoria_id is not null then
    select nombre into categoria_nombre
    from public.categorias
    where id = new.categoria_id;
  end if;

  texto_normalizado := public.normalizar_texto_moderacion(
    pg_catalog.concat_ws(' ', new.titulo, new.descripcion, categoria_nombre, new.ubicacion)
  );

  for regla in
    select codigo, patron, patron_exclusion, motivo_usuario
    from public.moderacion_reglas_solicitudes
    where activa
    order by prioridad, codigo
  loop
    if texto_normalizado ~ regla.patron
      and (regla.patron_exclusion is null or texto_normalizado !~ regla.patron_exclusion)
    then
      raise exception using
        errcode = '23514',
        message = regla.motivo_usuario,
        detail = 'MODERACION_SOLICITUD:' || regla.codigo,
        hint = 'Describe una finalidad legitima y las autorizaciones aplicables.';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.comprobar_moderacion_solicitud() from public;

drop trigger if exists moderar_solicitud_antes_de_escribir on public.solicitudes;
create trigger moderar_solicitud_antes_de_escribir
before insert or update on public.solicitudes
for each row execute function public.comprobar_moderacion_solicitud();
