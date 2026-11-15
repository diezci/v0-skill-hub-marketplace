# Perfil profesional común y acreditaciones

## Decisión de producto

El espacio empresarial avanzado queda conservado en la rama `codex/mi-empresa-diseno-acreditacion`, commit `93aa1d9`, para retomarlo en el futuro. No se ha aplicado ninguna de sus migraciones ni se ha publicado esa versión.

Esta implementación parte de `origin/main` (`1834d57`, incluyendo pagos por hitos) en `codex/perfil-profesional-unificado`. La copia de escritorio con cambios anteriores permanece intacta.

Las nuevas cuentas usan `/mi-perfil`, tanto particulares como sociedades. No se crean nuevos espacios empresariales ni equipos. Los espacios existentes conservan acceso a sus operaciones, miembros y cobros; no se convierten sus contratos ni cuentas bancarias automáticamente.

## Acreditaciones y revisión

- Un expediente privado distingue particular/empresa y recoge nombre legal, NIF, domicilio fiscal, actividad, formación/experiencia y documentos PDF. Una sociedad aporta además representante, facultades y su documento acreditativo. Las habilitaciones dependen de la actividad; no se afirma que todos los servicios exijan un título.
- Los PDF son privados y se abren mediante acceso temporal autorizado, para su titular o administración. Una referencia de archivo ajena no puede incorporarse al expediente.
- `/admin/verificaciones` permite revisar documentos, comprobar identidad y actividad, comprobar representación cuando corresponda, pedir correcciones, aprobar o retirar la acreditación. Aprobar exige las confirmaciones y una nota interna; no se admite autoaprobación ni revisar una versión obsoleta.
- Las modificaciones materiales de los servicios/certificaciones retiran la acreditación y requieren nueva revisión. Cambiar fotos, precios o zona no sustituye la identidad legal.
- La publicación del perfil y las nuevas ofertas/contratos requieren verificación vigente. Las operaciones históricas siguen disponibles. Los perfiles previamente verificados conservan su estado hasta un cambio material o una nueva solicitud: no se atribuyen retrospectivamente documentos que no presentaron.
- Los proyectos externos del portfolio permanecen privados hasta su acreditación en `/admin/portfolio`. Los trabajos completados en Diime se contrastan con su contrato. Modificar un proyecto externo exige nueva revisión; las reseñas y la verificación general del perfil son conceptos separados.

## Identidad y cobros

Una nueva empresa usa el mismo perfil y `profesional_id`, con identidad fiscal de sociedad y cuenta Stripe de tipo empresa. No se infiere la identidad de una membresía ni de metadatos enviados por el cliente. La identidad del proveedor se fija en cada contrato y sus justificantes; no se reescriben operaciones antiguas.

La creación de cuentas comprueba la versión de identidad bajo bloqueo. Una cuenta ya vinculada impide cambiar titular/tipo/NIF mediante el formulario ordinario. Para cuentas personales anteriores sin expediente, se permite presentar el primer expediente particular y el administrador debe contrastarlo con su cuenta de cobros antes de aprobar. No se convierten cuentas personales en cuentas de sociedades.

Los cambios mantienen la integración Stripe existente; no se crean cuentas ni se realizan pagos reales durante la validación.

## Publicación pendiente

No se han aplicado cambios en Supabase remoto ni desplegado esta rama. Las migraciones preparadas deben revisarse y aplicarse en este orden antes de publicar la interfaz:

1. `20261115155239_portfolio_perfil_acreditado.sql`
2. `20261115155424_aparcar_altas_empresa_especializada.sql`
3. `20261115155440_acreditacion_profesional_unificada.sql`

Los proyectos externos ya existentes en el portfolio común pasan a revisión, conservando su contenido. Los RPC de altas/invitaciones empresariales quedan deshabilitados, no sólo ocultos. Reactivar el espacio especializado requiere tanto cambiar la política de producto como restaurar explícitamente los permisos SQL correspondientes.

## Vista previa

```sh
DIIME_PERFIL_PREVIEW=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 3294
```

Abrir `http://127.0.0.1:3294/local-perfil-unificado-preview`. La ruta sólo funciona en desarrollo, con la variable activada y host local. Usa el componente real de perfil y el formulario real con datos ficticios; la subida y envío de esta demostración no contactan con Supabase. No constituye una prueba de extremo a extremo contra producción.

## Validación realizada

- Compilación de producción y TypeScript correctos (`npm run build -- --webpack`).
- 66 comprobaciones de acciones de acreditación: sesión/permisos, PDF real, tamaño, categoría, limpieza tras errores y acceso temporal.
- 42 comprobaciones PostgreSQL/PGlite del expediente: titularidad de documentos, revisión obsoleta, autoaprobación, identidad legacy, bloqueo de cambios, contratos y liquidación.
- 62 comprobaciones PostgreSQL/PGlite del portfolio, incluyendo RPC público y acceso directo a tabla, propiedad y retirada de acreditación.
- 421 comprobaciones SQL de compatibilidad empresarial y pausa de altas/invitaciones; registro, autenticación, navegación y rutas comprobados con fixtures.
- Pruebas Connect (14), pagos (25), permisos (22), webhooks y publicación aprobadas sin llamadas a Stripe. La suite de pagos por hitos conserva sus 30 pruebas aprobadas.
- Traducciones e inventario de errores SQL/RPC comprobados.
- Navegador local: mismo componente de perfil para ambos tipos, campos/documentos adicionales de sociedad, selector de representación y texto multilínea. Formulario sin desbordamiento horizontal a 390 px. No es una prueba en dispositivo físico ni un recorrido autenticado contra Supabase remoto.

- Integración completa con PostgreSQL 17: 54 comprobaciones, incluyendo actualización de todas las migraciones, carreras de solicitudes/Stripe, protección Storage ante políticas genéricas y retirada de verificación legacy ante un cambio de actividad. Evidencia local: `.build/verification-integration-results.json`.
