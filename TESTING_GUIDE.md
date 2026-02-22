GUÍA COMPLETA DE PRUEBA DEL SISTEMA
===================================

## 1. REGISTRAR TRES USUARIOS EN LA APP

### Usuario 1: ADMINISTRADOR
- Email: admin@skillhub.test
- Contraseña: AdminTest123!
- Nombre: Admin Panel
- Tipo: Particular

### Usuario 2: CLIENTE
- Email: cliente@skillhub.test
- Contraseña: ClienteTest123!
- Nombre: Juan Cliente
- Tipo: Particular

### Usuario 3: PROVEEDOR
- Email: proveedor@skillhub.test
- Contraseña: ProveedorTest123!
- Nombre: Carlos Proveedor
- Tipo: Particular → Convertirse a Profesional

---

## 2. WORKFLOW COMPLETO DE PRUEBA

### Paso 1: Login como CLIENTE
1. Ingresa con cliente@skillhub.test
2. Ve a "Demandas" → Crea nueva demanda
3. Título: "Pintar mi salón"
4. Descripción: "Necesito pintar mi salón de azul claro"
5. Ubicación: Madrid
6. Presupuesto: 300€ - 600€
7. Urgencia: Media
8. Publica la demanda

### Paso 2: Login como PROVEEDOR
1. Ingresa con proveedor@skillhub.test
2. Ve a "Demandas"
3. Encuentra la demanda "Pintar mi salón"
4. Haz click en la demanda
5. Haz click en el cliente (Juan Cliente) para ver su perfil
6. Vuelve a la demanda y envía una oferta:
   - Precio: 500€
   - Tiempo: 3 días
   - Descripción: "Pintura profesional con preparación"

### Paso 3: Login como CLIENTE (aceptar oferta)
1. Ve a "Mis Solicitudes"
2. En la demanda "Pintar mi salón", verás la oferta del proveedor
3. Acepta la oferta
4. El sistema crea un trabajo con escrow retenido
5. Ve a "Mis Solicitudes" → El trabajo aparece en estado "Pendiente de Pago"
6. Haz click en "Pagar con Stripe"
7. Usa tarjeta de prueba: 4242 4242 4242 4242, exp: 12/25, CVC: 123
8. Se completa el pago y los fondos se retienen en escrow

### Paso 4: Login como PROVEEDOR (actualizar trabajo)
1. Ve a "Mis Trabajos"
2. El trabajo "Pintar salón" aparece en "En Progreso"
3. Actualiza el progreso a 50%
4. Actualiza el progreso a 100%
5. Marca como "Entregado"

### Paso 5: Login como CLIENTE (confirmar o rechazar)
1. Ve a "Mis Solicitudes"
2. El trabajo muestra opción de "Confirmar Finalización" o "Rechazar"

#### OPCIÓN A: Confirmar Finalización
1. Haz click en "Confirmar Finalización"
2. Los fondos se liberan al proveedor (500€ - 5% = 475€)
3. Aparece dialogo para dejar valoración
4. Deja una reseña de 5 estrellas con comentario
5. La valoración se guarda

#### OPCIÓN B: Rechazar Trabajo (para probar disputas)
1. Haz click en "Rechazar y Solicitar Reembolso"
2. Selecciona motivo: "El color no es el acordado"
3. Se crea una DISPUTA en estado "abierta"
4. Se calcula reembolso: 500€ - 10% (comisión cliente) = 450€
5. La disputa aparece en el panel de admin

### Paso 6: Login como ADMINISTRADOR (resolver disputa)
1. Ve a /admin/disputes
2. El sistema verifica tu rol = "admin"
3. Ves la disputa en estado "Abierta"
4. Revisar detalles:
   - Monto en disputa: 500€
   - Cliente: Juan Cliente
   - Proveedor: Carlos Proveedor
   - Razón: El color no es el acordado

5. RESUELVE DE 3 FORMAS:

##### Opción 1: Favorecer al CLIENTE (Reembolso total)
- Cliente recibe: 450€ (menos comisión 10%)
- Proveedor recibe: 0€
- Plataforma retiene: 50€

##### Opción 2: Favorecer al PROVEEDOR (Pago completo)
- Cliente recibe: 0€
- Proveedor recibe: 475€ (menos comisión 5%)
- Plataforma retiene: 25€

##### Opción 3: DIVIDIR 50/50
- Cliente recibe: 225€
- Proveedor recibe: 237.50€
- Plataforma retiene: 37.50€

6. Haz click en resolver y confirma la decisión

---

## 3. VERIFICAR TODO FUNCIONA

### Verificar Pagos con Stripe
- Los pagos aparecen en Stripe Dashboard
- El webhook procesa los pagos correctamente
- El escrow retiene los fondos

### Verificar Valoraciones
- El cliente puede valorar al proveedor
- La valoración aparece en el perfil del proveedor
- El rating promedio se recalcula

### Verificar Disputas y Admin
- Las disputas se crean al rechazar trabajos
- El admin puede ver todas las disputas
- Las resoluciones actualizan el escrow correctamente
- Los fondos se liberan según la decisión

### Verificar Comisiones
- Cliente paga 10% de comisión adicional
- Proveedor se lleva 5% menos
- Plataforma retiene la diferencia

---

## 4. PRUEBA DE CHAT

1. Después de aceptar una oferta, cliente y proveedor pueden chatear
2. Ve a "Mensajes"
3. Selecciona la conversación sobre el trabajo
4. Envía mensajes bidireccionales
5. Los mensajes se guardan en tiempo real

---

## 5. URLS IMPORTANTES

- Landing: http://localhost:3000/
- Demandas: http://localhost:3000/demandas
- Mis Solicitudes: http://localhost:3000/mis-solicitudes
- Mis Trabajos: http://localhost:3000/mis-trabajos
- Mensajes: http://localhost:3000/mensajes
- Admin Disputes: http://localhost:3000/admin/disputes
- Mi Perfil: http://localhost:3000/mi-perfil

---

## 6. CUENTAS DE TEST (ya en la BD)

Categoría de ejemplo: "Pintura y Decoración"

Para otros datos, usa el workflow anterior creando nuevos registros en la app.

---

## 7. NOTAS IMPORTANTES

- Los emails de test NO envían correos reales
- Stripe está en modo TEST (usa tarjetas de prueba)
- Las disputas solo pueden ser resueltas por ADMINS
- Los fondos se retienen en escrow hasta confirmación/resolución
- Las valoraciones son permanentes y no se pueden editar

---

Cualquier problema contacta al equipo de desarrollo.
