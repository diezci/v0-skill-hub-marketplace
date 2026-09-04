# Diime

Diime es un marketplace español de servicios locales. Una persona publica lo
que necesita, recibe ofertas de profesionales, conversa con ellos y gestiona el
trabajo y el pago protegido desde la misma aplicación.

La aplicación web está construida con Next.js 16, React 19, Supabase y Stripe
Connect. Los clientes móviles de iOS y Android usan Capacitor y cargan la web de
producción con una pantalla offline local.

## Desarrollo local

Requisitos: Node.js 22 y pnpm.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Las variables de `.env.example` no contienen secretos. Las credenciales reales
de Supabase, Stripe, Resend, Firebase y APNs deben permanecer en el gestor de
secretos del entorno y nunca se guardan en Git.

## Comprobaciones

```bash
pnpm build
pnpm test:moderacion
pnpm lint
```

El build de Next se mantiene tolerante a los errores TypeScript heredados para
no bloquear la publicación actual. Esa excepción está documentada en
`MOBILE_RELEASE.md` y debe retirarse cuando termine el saneamiento de tipos.

## Operación y publicación

- `OPERATIONS_RUNBOOK.md`: alertas, revisión diaria, prioridades y escalado.
- `REVIEW_ACCOUNTS.md`: creación segura de las cuentas de revisión.
- `STRIPE_PAYMENTS_SETUP.md`: pagos, wallets y webhook de producción.
- `STORE_COMPLIANCE_ES.md`: privacidad, edad y DSA.
- `STORE_LISTING_ES.md`: textos y recursos de las tiendas.
- `MOBILE_RELEASE.md`: compilación y publicación móvil.
- `LAUNCH_STRATEGY.md`: lanzamiento comercial inicial en Madrid.

## Despliegue

La web pública es [diime.es](https://www.diime.es). Cada despliegue debe incluir
las migraciones nuevas de `supabase/migrations`, las variables de entorno
necesarias y las comprobaciones del runbook antes de recibir tráfico o pagos.
