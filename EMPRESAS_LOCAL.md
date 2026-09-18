# Empresas dentro de Diime: revisión local

Arranque: `pnpm dev:empresas`. Abre <http://127.0.0.1:3200/empresa/reformas-garcia>.

Esta versión utiliza las páginas, navegación y componentes de Diime. Las acciones se ejecutan en el servidor y persisten en `outputs/empresas-local/state.json`; la documentación se guarda fuera de `public`. Esta carpeta está excluida de Git. Todos los nombres, reseñas, trabajos, identidades y documentos del recorrido son datos de prueba. No se envían invitaciones por correo ni se conectan pagos.

## Pantallas

- `/profesionales`: empresa en el catálogo.
- `/empresa/reformas-garcia`: presentación, web, trabajos, reseñas, equipo y petición de presupuesto.
- `/profesional/ana`: habilidades y participación de la persona, con enlace a la empresa. Las valoraciones se contabilizan en la empresa.
- `/mi-empresa`: perfil, miembros, permisos, solicitudes, verificación y vista de cobros de empresa.
- `/mi-empresa/invitaciones/<token>`: aceptación individual de una invitación.

La barra «Entorno local» permite cambiar entre Javier (principal), Ana (administradora), Mario (miembro), Lucía (cliente), Elena (invitada) y el revisor de Diime. Las identidades de prueba solo funcionan con `DIIME_EMPRESAS_LOCAL=1`, fuera de producción y mediante un Host de loopback. El servidor se enlaza a `127.0.0.1`.

## Recorrido para revisar

1. Visita el perfil de empresa y abre las pestañas Trabajos, Reseñas y Equipo. Desde Ana vuelve a la empresa.
2. Cambia a Cliente, pide un presupuesto y consulta la solicitud en Mi empresa como Javier o Ana. El proveedor permanece vinculado a la empresa.
3. Como Javier, edita el perfil o invita a `elena@empresa.example`. Copia el enlace local, cambia a Elena y acepta. El enlace caduca a los siete días y solo sirve una vez.
4. Edita los permisos o revoca el acceso. La siguiente operación del miembro se rechaza; su historial de participación permanece. El responsable principal está protegido frente a revocación o degradación.
5. Desde Verificación, presenta un PDF ficticio. Pasa a revisión sin conceder la insignia automáticamente. Como revisor Diime, descarga el documento privado y solicita información o aprueba; vuelve al responsable para ver el resultado.

El estado inicial incluye una empresa marcada como verificada para explorar el recorrido. Esa insignia es ficticia. La carga de un PDF **no valida una firma electrónica ni la representación legal**: aquí se prueba el flujo de presentación y revisión manual. Antes de usarlo con empresas reales hacen falta comprobaciones efectivas de identidad, representación y vigencia documental.

## Alcance y continuidad

El dominio local aplica autorizaciones en cada acción, evita la escalación de permisos, protege los documentos, conserva al proveedor de cada solicitud y registra quién realizó los cambios. Los permisos de mensajes, encargos y cobros ilustran la delegación; todavía no habilitan esos módulos reales ni transferencias de dinero. La aceptación de una invitación no crea una cuenta de Supabase.

Para activar esta función con usuarios reales hace falta un adaptador de persistencia en Supabase con migraciones y RLS, autenticación real, correo de invitaciones, vinculación de conversaciones/presupuestos/encargos al proveedor empresa, verificación documental real e integración de los cobros. El modo normal conserva el registro de empresa anterior. No se han aplicado migraciones ni publicado cambios.

## Cobros: propuesta y diferencia con la implementación actual

La pestaña Cobros reutiliza el estilo de `StripeConnectCard`, muestra la empresa como titular y un estado «Sin conectar», sin saldos inventados. Solo aparece la información para quien tiene `ver_cobros`; la explicación del alta está disponible para el principal. No llama a Stripe ni crea cuentas o pagos.

Actualmente `app/actions/stripe-connect.ts` ya distingue `company` e `individual` según `profiles.empresa_id`, pero guarda `stripe_account_id` en `profesionales`. La clave de idempotencia de alta también depende del profesional. `app/actions/escrow.ts` deriva el cobro desde `ofertas.profesional_id` y `trabajos.profesional_id`. Esto todavía no es una cuenta de cobros compartida por una empresa con varios miembros.

El diseño propuesto para la integración real es:

1. Una cuenta Stripe Connect por proveedor económico: empresa o profesional independiente. Para la empresa, el alta y la idempotencia se vinculan a `empresa_id`; añadir empleados no crea cuentas de cobro adicionales.
2. Oferta y trabajo guardan por separado la empresa contratada y el usuario que actúa por ella. El servidor obtiene la empresa desde la pertenencia activa y comprueba los permisos; el cliente no puede elegir libremente el destinatario bancario.
3. La contratación fija el proveedor y el destino de cobro. Revocar a un empleado, cambiar de administrador o trabajar luego para otra empresa no redirige pagos anteriores. Se conserva el mecanismo actual de liquidación persistente e idempotente de `lib/flujo-pagos.ts` y `lib/stripe-liquidacion.ts`.
4. El cliente paga con el flujo protegido de Diime. Al cumplirse las condiciones de liberación, el neto correspondiente se transfiere a la empresa. Los empleados no reciben repartos automáticos; la empresa remunera a su equipo por sus propios procedimientos.
5. `ver_cobros` permite consultar; preparar presupuestos no concede acceso financiero. La configuración de titularidad, banco y accesos completos a Stripe queda reservada al principal, con autenticación reforzada, auditoría y avisos. No se entrega un enlace de acceso completo a Stripe a alguien con permiso de solo lectura.
6. Devoluciones, disputas y facturas conservan el proveedor original. Las cuentas ya existentes requieren conciliación individual; no se mueve saldo ni se cambia titularidad automáticamente para adaptarlas al nuevo modelo.
7. El alta alojada en Stripe comprueba sus requisitos de identidad y cobros; Diime comprueba por separado la autorización de quien administra la empresa. Ambas deben cumplir los requisitos antes de habilitar nuevas contrataciones de pago.

Fuentes: [Verificación de cuentas conectadas](https://docs.stripe.com/connect/identity-verification), [alta alojada](https://docs.stripe.com/connect/hosted-onboarding), [cargos y transferencias separados](https://docs.stripe.com/connect/separate-charges-and-transfers).

## Verificación técnica

Pruebas de dominio: `pnpm test:empresas`. Las 12 pruebas usan carpetas temporales aisladas; no cambian la empresa que se muestra en el navegador.

Comprobado también en navegador: edición persistente, solicitud como cliente, aceptación con el destinatario correcto, delegación de permisos, revocación con conservación del historial y revisión documental completa. Las pantallas públicas y de gestión se han revisado a 320, 390 y 1024 px, incluidos los diálogos móviles, sin desbordamiento horizontal ni errores JavaScript. Evidencia local en `outputs/empresas-local-capturas`.

Compilación: `pnpm build`. El proyecto mantiene errores de TypeScript previos y configura la compilación para omitir el chequeo de tipos; por eso el build y `pnpm exec tsc --noEmit` son verificaciones diferentes.

Para empezar otra demostración, con el servidor detenido puedes renombrar `outputs/empresas-local` y arrancarlo de nuevo. Conserva la carpeta anterior si necesitas sus pruebas o documentos.
