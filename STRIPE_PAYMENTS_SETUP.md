# Métodos de pago de Stripe

El checkout de Diime usa los métodos de pago dinámicos de Stripe. No fija una
lista en el código: Stripe muestra automáticamente las opciones activadas que
sean compatibles con el importe, la divisa, el país y el dispositivo.

## Activar Apple Pay, Google Pay y Link

1. En Stripe, abre **Settings > Payment methods** y activa Apple Pay, Google Pay
   y Link en la configuración que vaya a usar Diime.
2. En **Settings > Payment method domains**, registra por separado:
   - `diime.es`
   - `www.diime.es`
   - cualquier dominio de staging que muestre el checkout
3. Si creas una configuración específica para Diime, copia su identificador
   `pmc_...` en `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID` en Vercel.
4. Repite la activación y el registro del dominio en el entorno de prueba antes
   de probar con claves de test.

Stripe solo muestra cada wallet cuando está disponible. Apple Pay requiere un
dispositivo/navegador compatible con una tarjeta añadida a Wallet; Google Pay
requiere un entorno compatible y una cuenta configurada. La tarjeta seguirá
disponible como alternativa.

La compatibilidad de wallets dentro de la WebView de la app Capacitor puede ser
más limitada que en Safari o Chrome. La integración web queda habilitada con
este checkout; si las pruebas de las builds iOS/Android no muestran una wallet,
habrá que usar los SDK nativos de Stripe y configurar el Merchant ID de Apple y
Google Pay en cada proyecto nativo.

## Webhook obligatorio

El endpoint de producción debe apuntar a:

`https://www.diime.es/api/stripe/webhook`

Configura las credenciales reales de Diime en Vercel como
`DIIME_STRIPE_SECRET_KEY`, `NEXT_PUBLIC_DIIME_STRIPE_PUBLISHABLE_KEY` y
`DIIME_STRIPE_WEBHOOK_SECRET`. Tienen prioridad sobre las variables estándar
que pueda inyectar una integración o sandbox de Vercel.

El webhook debe escuchar estos eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `refund.updated`
- `charge.dispute.created`

## Comprobación rápida

- Prueba Safari en un iPhone/Mac con Apple Pay configurado.
- Prueba Chrome en Android con Google Pay configurado.
- Comprueba también una tarjeta normal y Link.
- Haz las pruebas tanto en modo test como en producción con un importe pequeño.

El checkout embebido está configurado sin redirecciones. Esto admite tarjeta,
Apple Pay, Google Pay y Link, y evita ofrecer métodos externos que abandonarían
el flujo de custodia antes de confirmar el pago.
