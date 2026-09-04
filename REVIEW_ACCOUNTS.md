# Cuentas de revisión de tiendas

Estado: creadas y confirmadas en Supabase de producción el 4 de septiembre de
2026. Las contraseñas se entregan al titular y no se guardan en este
repositorio.

Las cuentas de App Review y Google Play deben ser exclusivas, estables, sin MFA
y contener únicamente datos ficticios. Las contraseñas se guardan en el gestor
de contraseñas y en las consolas de las tiendas, nunca en Git.

Identidades reservadas:

- Cliente: `revision.cliente@diime.es` — **Clara Revisión**, Madrid.
- Profesional: `revision.profesional@diime.es` — **Álex Profesional**, Madrid,
  pintura y decoración.

El script administrativo crea o actualiza ambas cuentas, confirma sus emails,
registra la aceptación legal y deja una solicitud con una oferta para que el
revisor pueda recorrer la aplicación sin utilizar datos personales reales.

```bash
export NEXT_PUBLIC_SUPABASE_URL='https://…supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='…'
export REVIEW_CLIENT_PASSWORD='contraseña exclusiva'
export REVIEW_PRO_PASSWORD='otra contraseña exclusiva'
pnpm ops:create-review-accounts
```

También se pueden sobrescribir los correos mediante `REVIEW_CLIENT_EMAIL` y
`REVIEW_PRO_EMAIL`. El script no imprime contraseñas y puede ejecutarse de nuevo
sin duplicar la solicitud ni la oferta.

Después de ejecutarlo:

1. Iniciar sesión con ambas cuentas en producción.
2. Confirmar que el cliente ve la solicitud de demostración y el profesional su
   oferta pendiente.
3. Probar chat y adjuntos, sin introducir datos reales.
4. No completar un pago real durante la revisión; las notas de la tienda deben
   indicar qué recorrido es seguro.
5. Guardar las credenciales únicamente en App Store Connect, Google Play Console
   y el gestor de contraseñas del titular.
