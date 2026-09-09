import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

const connectionString = process.env.DIIME_PERMISSIONS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Configura DIIME_PERMISSIONS_TEST_DATABASE_URL con una base LOCAL aislada que tenga la migración de permisos")
const destino = new URL(connectionString)
if (!["127.0.0.1", "localhost", "[::1]"].includes(destino.hostname)) throw new Error("Estas pruebas solo admiten PostgreSQL local")
const { default: pg } = await import(process.env.DIIME_PG_MODULE || "../.build/workflow-db/node_modules/pg/lib/index.js")
const db = new pg.Client({ connectionString })
const ids = Object.fromEntries(["cliente", "particular", "representante", "empleado", "ajeno", "pendiente", "admin", "sin_perfil"].map((rol) => [rol, randomUUID()]))
const checks = []
await db.connect()
await db.query("begin")
async function como(rol, actor, consulta, args = []) {
  await db.query("reset role")
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor || null, role: rol })])
  await db.query(`set local role ${rol}`)
  return db.query(consulta, args)
}
async function denegado(nombre, actor, sql, args = [], role = "authenticated", code = "42501") {
  await db.query("savepoint ataque")
  let error
  try { await como(role, actor, sql, args) } catch (e) { error = e }
  await db.query("rollback to savepoint ataque")
  assert.equal(error?.code, code, `${nombre}: ${error?.message || "se permitió"}`)
  checks.push(nombre)
}
try {
  await como("postgres", null, "select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true)")
  for (const [rol, id] of Object.entries(ids)) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)", [id, `${rol}@test.invalid`, rol === "pendiente" ? null : new Date()])
    if (rol === "sin_perfil") continue
    await db.query("insert into public.profiles(id,email,nombre,es_admin) values($1,$2,$3,$4)", [id, `${rol}@test.invalid`, rol, rol === "admin"])
  }
  for (const rol of ["particular", "representante", "empleado", "admin"]) {
    await como("authenticated", ids[rol], "insert into public.profesionales(id,titulo) values($1,'Proveedor de prueba')", [ids[rol]])
    checks.push(`alta proveedor ${rol} sin privilegios Stripe`)
  }
  await denegado("alta de proveedor falsificando cuenta Stripe", ids.ajeno,
    "insert into public.profesionales(id,titulo,stripe_account_id) values($1,'Ataque','acct_ajeno')", [ids.ajeno])
  for (const campo of ["stripe_account_id = 'acct_falso'", "stripe_transferencias_habilitadas = true", "stripe_payouts_habilitados = true", "stripe_onboarding_completado = true", "stripe_requisitos_pendientes = '[\"fake\"]'::jsonb", "stripe_estado_actualizado_at = now()"])
    await denegado(`proveedor no modifica ${campo.split(" =")[0]}`, ids.particular, `update public.profesionales set ${campo} where id=$1`, [ids.particular])
  await como("service_role", null, "update public.profesionales set stripe_account_id='acct_servidor', stripe_transferencias_habilitadas=true where id=$1", [ids.particular])
  checks.push("servidor actualiza estado Stripe legítimo")
  assert.equal((await como("authenticated", ids.particular, "update public.profesionales set titulo='Nuevo título' where id=$1", [ids.particular])).rowCount, 1)
  checks.push("proveedor conserva edición ordinaria")

  const vincular = "select public.vincular_mi_empresa($1,$2,$3,$4,$5,$6,$7) as id"
  await como("service_role", null, "update public.profesionales set stripe_account_id='acct_representante_anterior', stripe_onboarding_completado=true, stripe_transferencias_habilitadas=true, stripe_payouts_habilitados=true where id=$1", [ids.representante])
  const empresa = (await como("authenticated", ids.representante, vincular, [null,"Empresa prueba",`B${Date.now()}`,"11111111Z","Gerente",null,null])).rows[0].id
  const token = (await como("authenticated", ids.representante, "select token_invitacion from public.empresas where id=$1", [empresa])).rows[0].token_invitacion
  checks.push("representante crea empresa y vínculo atómicamente")
  const cuentaTrasEmpresa = (await como("authenticated", ids.representante, "select stripe_account_id,stripe_transferencias_habilitadas from public.profesionales where id=$1", [ids.representante])).rows[0]
  assert.equal(cuentaTrasEmpresa.stripe_account_id, "acct_representante_anterior")
  assert.equal(cuentaTrasEmpresa.stripe_transferencias_habilitadas, false)
  checks.push("cambio a empresa conserva cuenta previa y suspende nuevos cobros hasta verificar titularidad")
  const sincronizar = "select public.actualizar_estado_cuenta_stripe($1,$2,$3,true,true,true,'[]'::jsonb) as actualizado"
  assert.equal((await como("service_role", null, sincronizar, [ids.representante,"acct_representante_anterior",null])).rows[0].actualizado, false)
  checks.push("respuesta antigua individual no rehabilita cobros tras vínculo empresa")
  assert.equal((await como("service_role", null, sincronizar, [ids.representante,"acct_distinta",empresa])).rows[0].actualizado, false)
  checks.push("respuesta de cuenta antigua no altera nueva cuenta")
  await denegado("proveedor no invoca RPC interna de sincronización Stripe", ids.representante, sincronizar, [ids.representante,"acct_representante_anterior",empresa])
  assert.equal((await como("service_role", null, sincronizar, [ids.representante,"acct_representante_anterior",empresa])).rows[0].actualizado, true)
  checks.push("servidor sincroniza datos coherentes con empresa y cuenta actuales")

  assert.equal((await como("authenticated", ids.ajeno, "select id from public.empresas where id=$1", [empresa])).rowCount, 0)
  checks.push("ajeno no ve datos de empresa")
  await denegado("ajeno no se autoasigna empresa", ids.ajeno, "update public.profiles set empresa_id=$1 where id=$2", [empresa, ids.ajeno])
  await denegado("alta de perfil no permite asignarse empresa ajena", ids.sin_perfil,
    "insert into public.profiles(id,email,nombre,empresa_id) values($1,'sin-perfil@test.invalid','Ataque',$2)", [ids.sin_perfil, empresa])
  await denegado("particular no se autoasigna empresa", ids.particular, "update public.profiles set empresa_id=$1 where id=$2", [empresa, ids.particular])
  await denegado("token inválido no concede pertenencia", ids.ajeno, vincular, ["token-invalido",null,null,"22222222Z",null,null,null], "authenticated", "22023")
  await denegado("correo pendiente no canjea invitación", ids.pendiente, vincular, [token,null,null,"22222222Z",null,null,null])
  await denegado("anónimo no canjea invitación", null, vincular, [token,null,null,"22222222Z",null,null,null], "anon")
  await denegado("lookup anterior no filtra identificadores de empresa", ids.ajeno, "select public.empresa_id_por_token($1)", [token])
  assert.equal((await como("authenticated", ids.empleado, vincular, [token,null,null,"33333333Z","Empleado",null,null])).rows[0].id, empresa)
  assert.equal((await como("authenticated", ids.empleado, "select id from public.empresas where id=$1", [empresa])).rowCount, 1)
  assert.equal((await como("authenticated", ids.empleado, vincular, [token,null,null,"33333333Z","Empleado",null,null])).rows[0].id, empresa)
  checks.push("proveedor empleado entra por invitación y reintento devuelve mismo vínculo")
  const otra = (await como("authenticated", ids.ajeno, vincular, [null,"Otra empresa",`A${Date.now()}`,"44444444Z",null,null,null])).rows[0].id
  const otroToken = (await como("authenticated", ids.ajeno, "select token_invitacion from public.empresas where id=$1", [otra])).rows[0].token_invitacion
  await denegado("no se cambia empresa activa silenciosamente", ids.empleado, vincular, [otroToken,null,null,"33333333Z",null,null,null])

  const conversacion = randomUUID(), mensaje = randomUUID(), notificacion = randomUUID()
  await como("service_role", null, "insert into public.conversaciones(id,participante_1,participante_2) values($1,$2,$3)", [conversacion, ids.cliente, ids.particular])
  await como("authenticated", ids.cliente, "insert into public.mensajes(id,conversacion_id,remitente_id,contenido) values($1,$2,$3,'Texto original')", [mensaje, conversacion, ids.cliente])
  await denegado("receptor no falsifica contenido", ids.particular, "update public.mensajes set contenido='Falso' where id=$1", [mensaje])
  await denegado("receptor no falsifica remitente", ids.particular, "update public.mensajes set remitente_id=$1 where id=$2", [ids.particular, mensaje])
  assert.equal((await como("authenticated", ids.ajeno, "update public.mensajes set leido=true where id=$1", [mensaje])).rowCount, 0)
  checks.push("ajeno no marca leído un chat ajeno")
  assert.equal((await como("authenticated", ids.particular, "update public.mensajes set leido=true where id=$1 returning leido", [mensaje])).rows[0].leido, true)
  checks.push("receptor marca leído manteniendo mensaje")
  await denegado("receptor no reabre evidencia de lectura", ids.particular, "update public.mensajes set leido=false where id=$1", [mensaje])
  assert.equal((await como("authenticated", ids.cliente, "update public.mensajes set leido=true where id=$1", [mensaje])).rowCount, 0)
  checks.push("remitente no marca sus propios mensajes")

  await denegado("cuenta no fabrica notificación a tercero", ids.particular, "insert into public.notificaciones(usuario_id,tipo,titulo,mensaje) values($1,'falso','Falso','Falso')", [ids.cliente])
  await como("service_role", null, "insert into public.notificaciones(id,usuario_id,tipo,titulo,mensaje) values($1,$2,'legitima','Original','Original')", [notificacion, ids.particular])
  await denegado("dueño no modifica título de notificación", ids.particular, "update public.notificaciones set titulo='Falso' where id=$1", [notificacion])
  assert.equal((await como("authenticated", ids.particular, "update public.notificaciones set leida=true where id=$1 returning leida", [notificacion])).rows[0].leida, true)
  assert.equal((await como("authenticated", ids.ajeno, "update public.notificaciones set leida=true where id=$1", [notificacion])).rowCount, 0)
  checks.push("destinatario marca su notificación, ajeno no")
  await denegado("admin tampoco puede falsificar cuenta Stripe desde sesión", ids.admin, "update public.profesionales set stripe_account_id='acct_admin' where id=$1", [ids.admin])
  console.log(JSON.stringify({ pruebas: checks.length, resultado: "correcto", checks }, null, 2))
} finally {
  await db.query("rollback")
  await db.end()
}
