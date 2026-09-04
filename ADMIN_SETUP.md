## 🛡️ Cómo Probar el Panel de Admin

### 1. **Acceso al Panel de Admin**
La ruta protegida está en: `/admin/disputes`

### 2. **Crear una Cuenta Admin**

Para probar el sistema de admin, debes:

#### Opción A: Crear Admin Manual en Supabase
1. Ve a tu proyecto Supabase
2. En **SQL Editor**, ejecuta:
\`\`\`sql
-- Primero, crea un usuario en Auth (si no existe)
-- Luego, actualiza su perfil:
UPDATE profiles 
SET rol = 'admin' 
WHERE email = 'tu-email@ejemplo.com';
\`\`\`

#### Opción B: Usar Usuario de Prueba
1. Regístrate con cualquier email de pruebas (ej: `admin@diime.test`)
2. Luego en Supabase SQL:
\`\`\`sql
UPDATE profiles 
SET rol = 'admin' 
WHERE email = 'admin@diime.test';
\`\`\`

### 3. **Cómo Funciona el Sistema**

#### **Crear una Disputa** (Usuario normal):
- En "Mis Solicitudes" o "Mis Trabajos", click en "Rechazar y Solicitar Reembolso"
- O completa un trabajo y rechaza antes de confirmar
- Esto crea automáticamente una disputa

#### **Resolver Disputas** (Admin):
1. Login con usuario admin
2. Ve a `/admin/disputes`
3. Verás una lista de todas las disputas abiertas
4. Selecciona una disputa
5. Elige una resolución:
   - **Cliente**: El cliente recibe reembolso total
   - **Proveedor**: El proveedor recibe el pago completo
   - **50/50**: Se divide el dinero entre ambas partes
6. Escribe una descripción de la resolución
7. Click en "Resolver Disputa"

### 4. **Verificar que Funciona**

#### **Test 1: Crear Disputa**
- [ ] Crea 2 usuarios (cliente y proveedor)
- [ ] Cliente publica una demanda
- [ ] Proveedor envía oferta
- [ ] Cliente acepta oferta
- [ ] Cliente rechaza el trabajo = Se crea disputa automáticamente

#### **Test 2: Resolver como Admin**
- [ ] Login como admin
- [ ] Ve a `/admin/disputes`
- [ ] Deberías ver la disputa creada
- [ ] Resuelve la disputa
- [ ] Verifica que el escrow se actualiza correctamente

#### **Test 3: Comprobar Fondos**
- [ ] Si resolviste a favor del cliente: Cliente recibe reembolso (menos comisión)
- [ ] Si resolviste a favor del proveedor: Proveedor recibe el pago
- [ ] Si 50/50: Ambos reciben su parte

### 5. **Estructura de Base de Datos**

\`\`\`
Tabla: profiles
- rol: 'admin', 'cliente', 'proveedor', 'freelancer'

Tabla: disputas
- id: UUID
- trabajo_id: UUID
- iniciada_por: UUID
- tipo: 'cliente' | 'proveedor'
- estado: 'abierta' | 'resuelta' | 'cerrada'
- resolucion: 'cliente' | 'proveedor' | 'reembolso_parcial'
- resuelto_por: UUID (admin ID)
- descripcion: texto

Tabla: transacciones_escrow
- estado: 'pendiente' | 'liberado' | 'reembolsado'
- Se actualiza automáticamente cuando se resuelve una disputa
\`\`\`

### 6. **Protecciones Implementadas**

✅ Solo usuarios con `rol = 'admin'` pueden acceder a `/admin/disputes`
✅ El layout `/app/admin/layout.tsx` valida el rol antes de mostrar contenido
✅ Si no eres admin, serás redirigido a la página de inicio
✅ Si no estás autenticado, serás redirigido a login

---

**Notas importantes:**
- El rol de admin debe estar configurado en la tabla `profiles`
- Las disputas se crean automáticamente cuando se rechaza un trabajo
- Las resoluciones se registran con timestamp y admin ID
- Los fondos se liberan/reembolsan según la resolución
