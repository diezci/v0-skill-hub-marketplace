# Mi Empresa: edición, identidad y acreditación

Proyecto independiente en la rama `codex/mi-empresa-diseno-acreditacion`. La referencia de diseño es el perfil particular de `main` a 20 de noviembre de 2026 (`e7198c1`).

## Comportamiento

- El perfil usa la misma cabecera, portada, avatar, tarjetas, pestañas y acciones de edición que el particular. La tarjeta «Mi empresa» abre los datos legales, la verificación, el equipo y las operaciones. La web corporativa es editable. El equipo se gestiona en una sola pestaña del espacio; el perfil público conserva su equipo público.
- «Datos legales» separa identidad y domicilio del perfil comercial. El responsable principal puede corregir razón social y CIF; quienes tengan permiso de perfil pueden editar el domicilio. Un cambio de identidad retira la acreditación y exige nueva documentación. Se conservan los contratos y los snapshots fiscales anteriores.
- La búsqueda de domicilio utiliza portales localizados por CartoCiudad/IGN. El servidor firma el resultado, vinculado a usuario, empresa y texto de dirección, durante 15 minutos. Una coincidencia de calle o localidad no se presenta como portal comprobado. Localizar una dirección no prueba que la empresa tenga allí su domicilio. Un error del proveedor conserva el formulario y no inventa una validación.
- El editor antiguo ya no escribe el domicilio; los guardados concurrentes usan los datos anteriores para detectar versiones obsoletas.
- Portfolio de empresas y particulares: los trabajos completados en Diime pueden publicarse mediante su contrato; los proyectos externos permanecen privados hasta que Diime acredita las evidencias. El propietario ve el estado y las observaciones. Modificar el contenido invalida la aprobación. La revisión administrativa en `/admin/portfolio` exige motivo y evidencia; rechaza decisiones sobre versiones antiguas y la autoacreditación.
- Los proyectos externos existentes empiezan pendientes de revisión al aplicar la migración. Su contenido se conserva, pero deja de aparecer en las proyecciones públicas hasta acreditarse.
- La verificación ofrece un desplegable de representación: administrador único, solidario, mancomunado, consejero delegado, consejero con facultades, apoderado individual/solidario, apoderado mancomunado, representante de administrador persona jurídica y otra representación acreditada. El cargo declarado nunca acredita por sí solo las facultades.
- Si cambia el CIF y hay una cuenta Stripe vinculada, la aprobación de la empresa queda bloqueada hasta que Diime contraste la cuenta con el CIF actual, deje una nota y confirme la correspondencia. La comprobación y la aprobación se realizan de forma atómica; un expediente antiguo no sirve. No se modifica la cuenta Stripe ni los destinos de cobro de contratos anteriores.
- El selector de PDF muestra archivo, tamaño, cambio y retirada; máximo 5 MB. La documentación sigue siendo privada y requiere revisión.

## Validación

La revisión del 20 de noviembre añade pruebas de navegación del perfil compartido en móvil y escritorio, recuperación de los valores guardados al cancelar, permisos de lectura de PDF y 72 comprobaciones del portfolio local con revisión por Diime.

- `npm run build -- --webpack`: compilación y TypeScript correctos.
- 55 pruebas Node aprobadas: adaptadores, permisos, perfil, edición/cancelación, controles, portfolio, dirección y comprobantes firmados.
- Pruebas de borradores de portfolio e internacionalización aprobadas.
- PostgreSQL mediante PGlite: 475 comprobaciones tras integrar identidad, dirección, acreditación de portfolio y revisión de la cuenta de cobros; incluye permisos, proyecciones públicas, revisión obsoleta y preservación histórica.
- Navegador local: edición real de razón social/CIF ficticios; búsqueda real de Calle Alcalá 50, Madrid y selección; guardado de dirección; retirada de acreditación; selección de cargo; elección de PDF sintético y envío a revisión local. El estado final fue «En revisión», sin autoaprobación.
- Revisión visual a 1280 px y 390 px, claro y oscuro. Perfil, edición y verificación sin desbordamiento horizontal a 390 px. No es validación en un dispositivo físico.
- Las pruebas de portfolio/admin y permisos SQL no son un recorrido completo contra Supabase remoto; no se han modificado identidades, documentos, cuentas ni pagos reales.

## Vista local

```sh
DIIME_EMPRESAS_LOCAL=1 DIIME_EMPRESAS_LOCAL_DIR="$PWD/.build/empresa-compartida-demo" npm run dev -- --webpack --hostname 127.0.0.1 --port 3338
```

Abrir `http://127.0.0.1:3338/mi-empresa`. La ruta principal usa el mismo editor con los datos de ejemplo. Para inspeccionar el formulario de representación en borrador, abrir `/local-mi-empresa-preview?estado=borrador&seccion=verificacion`. Los documentos, imágenes y proyectos de prueba se guardan en el directorio local. Para revisar un proyecto externo en la demo, cambiar la cuenta de prueba a «Diime · Revisión» y abrir «Acreditación de portfolios» desde «Mi empresa».

## Referencias

- [Ley de Sociedades de Capital, artículo 233](https://www.boe.es/buscar/act.php?id=BOE-A-2010-10544#a233): régimen de representación.
- [CartoCiudad: servicios de geoprocesamiento](https://www.cartociudad.es/web/portal/directorio-de-servicios/geoprocesamiento): proveedor de búsqueda de direcciones.

## Esquema del proyecto independiente

Estas migraciones pertenecen al esquema de pruebas de la rama avanzada y preceden al perfil unificado publicado en `main`. Si en el futuro se integra el proyecto, habrá que conciliar el esquema de portfolio con las migraciones ya aplicadas en producción.

1. `20261114204415_empresa_identidad_editable_domicilio_comprobado.sql`
2. `20261114204419_portfolio_acreditacion.sql`
3. `20261114210316_empresa_cif_conciliacion_cobros.sql`

La comprobación de la identidad en Stripe es una revisión humana de Diime; el código no obtiene ni modifica datos fiscales de Stripe de forma automática. La prueba del nuevo control de conciliación es SQL, no una operación real contra Stripe ni un recorrido de navegador de su Dashboard.
