# Empresas: perfiles, equipo y supervisión

## Recorrido implementado

La empresa es una entidad independiente de sus miembros. El alta crea un borrador;
el responsable principal puede preparar la presentación e invitar al equipo sin
crear una ficha profesional individual. La representación se revisa con documento
PDF privado desde `/admin/verificaciones-empresas`. Solo Diime puede aprobarla.
Una empresa verificada aparece en Profesionales con Perfil, Trabajos, Valoraciones
y Equipo. La verificación de representación no acredita licencias o especialidades,
ni sustituye la comprobación de la cuenta de cobros por Stripe.

Cada cuenta pertenece a una persona. Los roles principal, administrador y miembro
se guardan en la base de datos, junto con permisos para perfil, mensajes,
presupuestos, encargos, equipo y finanzas. Solo el principal puede nombrar
administradores; un administrador no puede conceder permisos que no tiene.
La visibilidad pública de cada miembro es opcional. El cargo público no determina
sus permisos. Razón social e identidad fiscal permanecen separadas del nombre
comercial editable.

El perfil selecciona la cobertura desde el catálogo común de provincias y servicios,
incluida la cobertura de toda España. El directorio filtra por cualquiera de las
provincias elegidas. El logotipo se adjunta como PNG, JPEG o WebP de hasta 3 MB,
con vista previa; la subida comprueba el permiso para editar el perfil.

Administrar o incorporarse a una empresa no exige ficha profesional individual.
Para enviar presupuestos, el autor sí debe completar su perfil profesional; el
presupuesto conserva tanto su autoría como la empresa a la que representa.

Las invitaciones se dirigen a un correo confirmado, caducan a los siete días y
son revocables y de un solo uso. El administrador copia y comparte el enlace;
esta versión no envía correos de invitación automáticamente. Un enlace compartido
antiguo no autoriza incorporaciones. El registro conserva el retorno al enlace.

## Visibilidad del administrador

En Mi empresa, Operaciones muestra solicitudes, presupuestos y encargos de la
empresa, con filtros por persona. Actividad identifica a quien actuó y conserva
el historial tras su baja. Los miembros ven sus operaciones propias o asignadas.
Los permisos se comprueban en cada petición y en PostgreSQL.

Las conversaciones empresariales usan una bandeja compartida en Mensajes. Los
administradores pueden supervisarlas y los miembros atienden las que tienen
asignadas. Cada mensaje guarda el autor humano y la empresa representada.
Las conversaciones personales no se convierten en empresariales. La lectura se
registra por usuario. Las nuevas respuestas generan avisos para la contraparte.

Un administrador con permiso de encargos puede cambiar el responsable. El nuevo
operador continúa el progreso y la entrega; el cliente autorizado puede pagar y
confirmar la entrega desde Operaciones. La reasignación conserva los participantes
originales, la autoría, la identidad fiscal y el destino del dinero. También puede
continuar una cancelación o disputa según los permisos de su parte contractual;
aceptar una cancelación con efecto económico exige gestionar cobros. La baja
retira el acceso futuro sin borrar el historial.

## Cobros e identidad económica

La cuenta Connect empresarial se guarda por empresa en `empresa_cuentas_stripe`;
la cuenta personal permanece en `profesionales`. Son independientes aunque su
responsable sea la misma persona. Solo el principal administra el alta y el banco;
los permisos de consulta y gestión económica se comprueban por separado.

La contratación conserva empresa proveedora, empresa cliente y actor humano.
El destino de cobro se valida contra la identidad del proveedor y se fija antes
del pago. No se reconstruye a partir de la pertenencia actual del profesional.
Un destino histórico incorrecto se bloquea; no se sustituye silenciosamente.
Los justificantes guardan una copia de la identidad fiscal del contrato.

## Validación

```sh
pnpm test:empresas
pnpm test:empresas:produccion
pnpm test:cobros
pnpm test:reembolsos
node scripts/test-mensajes-lectura.mjs
node scripts/test-i18n.mjs
pnpm build
```

La suite PostgreSQL usa PGlite con roles `anon`, `authenticated` y `service_role`,
cuentas sintéticas y las migraciones reales. Comprueba invitaciones, revisión,
permisos, privacidad, revocaciones, continuidad, mensajes y destinos de cobro.
Las pruebas financieras simulan la API de Stripe y no mueven fondos.

```sh
PGLITE_PATH=/tmp/diime-empresa-db-tests/node_modules/@electric-sql/pglite/dist/index.js pnpm test:empresas:db
```

El chequeo global de TypeScript conserva 39 diagnósticos anteriores, fuera de los
nuevos módulos empresariales. Next está configurado para omitir ese chequeo en el
build. La revisión visual usa el componente real con datos ficticios, a 360 y
1280 px; esto no sustituye la comprobación del entorno publicado.

## Publicación conjunta

Orden de migraciones:

1. `20260921221953_empresas_equipo_identidad_auditoria.sql`
2. `20260921222030_empresa_liquidacion_destino.sql`
3. `20260921223402_empresa_facturacion_snapshot.sql`
4. `20261005163655_empresas_roles_operaciones_verificacion.sql`
5. `20261005163946_empresa_chat_acceso_y_mensajes.sql`
6. `20261005164234_empresa_stripe_independiente.sql`
7. `20261005180450_proteger_avisos_empresa_revocacion.sql`
8. `20261005182958_empresas_provincias_servicios_canonicos.sql`

Aplicar las migraciones verificadas y publicar la aplicación desde un checkout
que conserve los cambios ya publicados. Confirmar el commit de Vercel y probar
el sitio vivo. `pnpm dev:empresas` continúa siendo una demostración local aislada;
no debe activarse en producción ni usarse como evidencia de publicación.

### Comprobación del entorno real (5 de octubre de 2026)

Se comprobaron con sesiones reales el alta de un borrador privado, el rol principal,
las invitaciones dirigidas y de un solo uso, la supervisión del administrador,
la denegación de privilegios al miembro y la conservación del historial al revocar
su acceso. La empresa de prueba no apareció en el directorio ni en el perfil público.
Las tablas internas empresariales tienen RLS y no conceden acceso directo a los
roles públicos; las lecturas y cambios pasan por las funciones autorizadas.

El asesor de seguridad mantiene avisos sobre funciones y configuración de Auth
preexistentes. En las tablas empresariales, el aviso informativo de RLS sin políticas
es intencionado: el acceso directo está revocado. Referencia del asesor:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
