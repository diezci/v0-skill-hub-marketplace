import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import * as crypto from "node:crypto"
import { File } from "node:buffer"
import ts from "typescript"

// Ejecuta las acciones reales con dependencias cerradas: sin red, correos ni BD.
const ruta = "app/actions/verificacion-profesionales.ts"
const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const archivosModulo = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/archivos.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: archivosModulo.exports, module: archivosModulo, Uint8Array })

const PROVEEDOR = "11111111-1111-4111-8111-111111111111"
const AJENO = "22222222-2222-4222-8222-222222222222"
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const EMPRESA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const NOTA_INTERNA = "NOTA_RESERVADA_SOLO_ADMIN_67439"
const normalizar = (valor) => valor === undefined ? undefined : JSON.parse(JSON.stringify(valor))
const ACREDITACION = { tipoProveedor: "particular", nombreLegal: "Persona Prueba", nif: "12345678Z", domicilioFiscal: "Calle Prueba 1", actividad: "Montaje", cualificacion: "Experiencia documentada", documentos: [{ categoria: "identidad", url: "acreditacion://dddddddd-dddd-4ddd-8ddd-dddddddddddd", nombre: "id.pdf" }, { categoria: "cualificacion", url: "acreditacion://eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", nombre: "experiencia.pdf" }], consentimiento: true }

function solicitud(profesionalId, overrides = {}) {
  return {
    id: `solicitud-${profesionalId}`,
    profesional_id: profesionalId,
    estado: "pendiente",
    mensaje: "Revisar experiencia",
    comentario_publico: null,
    empresa_id: null,
    solicitada_at: "2026-09-09T20:00:00Z",
    actualizada_at: "2026-09-09T20:00:00Z",
    resuelta_at: null,
    ...overrides,
  }
}

function preparar(opciones = {}) {
  const usuario = opciones.usuario === undefined ? { id: PROVEEDOR } : opciones.usuario
  const tablas = {
    profiles: [
      { id: PROVEEDOR, nombre: "Proveedor", apellido: "Prueba", es_admin: false, verificado: false, empresa_id: null },
      { id: AJENO, nombre: "Ajeno", apellido: "Prueba", es_admin: false, verificado: false, empresa_id: null },
      { id: ADMIN, nombre: "Admin", apellido: "Prueba", es_admin: true, verificado: false, empresa_id: null },
    ],
    profesionales: [{ id: PROVEEDOR, titulo: "Montaje" }, { id: AJENO, titulo: "Servicio ajeno" }],
    solicitudes_verificacion_profesional: [solicitud(PROVEEDOR), solicitud(AJENO)],
    empresas: [{ id: EMPRESA, nombre: "Empresa sintética" }],
    historial_verificacion_profesional: [
      { id: "historial-propio", profesional_id: PROVEEDOR, estado: "en_revision", comentario_publico: "Revisando", nota_interna: NOTA_INTERNA, creado_at: "2026-09-09T20:00:00Z" },
      { id: "historial-ajeno", profesional_id: AJENO, estado: "pendiente", comentario_publico: null, nota_interna: "NOTA_AJENA", creado_at: "2026-09-09T19:00:00Z" },
    ],
    ...opciones.tablas,
  }
  const consultas = [], rpcs = [], revalidaciones = [], avisos = [], eventos = [], storage = []
  let lecturasSesion = 0

  function consultar(tabla) {
    const consulta = { tabla, columnas: "*", filtros: [], orden: [], rango: null, limite: null }
    consultas.push(consulta)
    let resultado

    async function ejecutar(unico = false) {
      if (resultado) return resultado
      eventos.push({ tipo: "consulta", tabla })
      const error = opciones.errorConsulta?.(consulta)
      if (error) return (resultado = { data: null, error })

      let filas = (tablas[tabla] || []).filter((fila) => consulta.filtros.every((filtro) => (
        filtro.tipo === "eq" ? fila[filtro.campo] === filtro.valor : filtro.valores.includes(fila[filtro.campo])
      )))
      if (consulta.orden.length) {
        filas = filas.toSorted((a, b) => {
          for (const { campo, ascendente } of consulta.orden) {
            const orden = String(a[campo] ?? "").localeCompare(String(b[campo] ?? ""))
            if (orden) return ascendente ? orden : -orden
          }
          return 0
        })
      }
      if (consulta.rango) filas = filas.slice(consulta.rango[0], consulta.rango[1] + 1)
      if (consulta.limite != null) filas = filas.slice(0, consulta.limite)
      if (consulta.columnas !== "*") {
        const campos = consulta.columnas.split(",").map((campo) => campo.trim())
        filas = filas.map((fila) => Object.fromEntries(campos.map((campo) => [campo, fila[campo]])))
      }
      return (resultado = { data: unico ? filas[0] ?? null : filas, error: null })
    }

    const constructor = {
      select(columnas) { consulta.columnas = columnas; return constructor },
      eq(campo, valor) { consulta.filtros.push({ tipo: "eq", campo, valor }); return constructor },
      in(campo, valores) { consulta.filtros.push({ tipo: "in", campo, valores: [...valores] }); return constructor },
      order(campo, configuracion = {}) { consulta.orden.push({ campo, ascendente: configuracion.ascending !== false }); return constructor },
      range(inicio, fin) { consulta.rango = [inicio, fin]; return constructor },
      limit(limite) { consulta.limite = limite; return constructor },
      maybeSingle() { return ejecutar(true) },
      then(resolver, rechazar) { return ejecutar().then(resolver, rechazar) },
    }
    return constructor
  }

  const supabase = {
    auth: {
      async getUser() {
        lecturasSesion++
        return { data: { user: usuario }, error: opciones.errorSesion ?? null }
      },
    },
    from: consultar,
    async rpc(nombre, parametros) {
      rpcs.push({ nombre, parametros: normalizar(parametros) })
      eventos.push({ tipo: "rpc", nombre })
      if (opciones.respuestasRpc && nombre in opciones.respuestasRpc) {
        const respuesta = opciones.respuestasRpc[nombre]
        return typeof respuesta === "function" ? respuesta(parametros) : respuesta
      }
      if (nombre === "contacto_perfiles") {
        return { data: parametros.p_ids.map((id) => ({ id, email: `${id}@example.test`, telefono: "600000000" })), error: null }
      }
      if (nombre === "empresa_contexto_actual") {
        const id = tablas.profiles.find(p => p.id === usuario?.id)?.empresa_id
        const empresa = tablas.empresas.find(e => e.id === id)
        return { data: empresa || null, error: id && !empresa ? { message: "Empresa no disponible" } : null }
      }
      if (nombre === "mi_acreditacion_profesional") return { data: { acreditacion: ACREDITACION, identidadCobrosBloqueada: false, tipoCobrosBloqueado: false }, error: null }
      if (nombre === "acreditaciones_profesionales_admin") return { data: parametros.p_ids.map(id => ({ profesional_id: id, acreditacion: ACREDITACION, identidadCobrosBloqueada: true, tipoCobrosBloqueado: true, cuentaStripe: "acct_test" })), error: null }
      if (nombre === "documento_acreditacion_profesional_metadata") return { data: { storage_path: `${PROVEEDOR}/documento.pdf`, nombre: "documento.pdf" }, error: null }
      if (["solicitar_acreditacion_profesional", "revisar_acreditacion_profesional"].includes(nombre)) {
        return { data: true, error: null }
      }
      throw new Error(`RPC no simulada: ${nombre}`)
    },
  }

  const admin = {
    storage: { from(bucket) { return {
      async upload(ruta, bytes, options) { storage.push({ tipo: "upload", bucket, ruta, bytes, options }); return { error: opciones.errorSubida || null } },
      async remove(rutas) { storage.push({ tipo: "remove", bucket, rutas }); return { error: null } },
      async createSignedUrl(ruta, ttl, options) { storage.push({ tipo: "signed", bucket, ruta, ttl, options }); return opciones.errorFirma ? { data: null, error: opciones.errorFirma } : { data: { signedUrl: "https://storage.test/private-signed" }, error: null } },
    } } },
    async rpc(nombre, parametros) { rpcs.push({ nombre, parametros }); return { data: null, error: opciones.errorRegistro || null } },
  }
  const dependencias = {
    "node:crypto": crypto,
    "@/lib/archivos": archivosModulo.exports,
    "@/lib/supabase/admin": { createAdminClient: () => opciones.sinAlmacenamiento ? null : admin },
    "@/lib/i18n-servidor": { textoServidor: async (texto) => texto },
    "next/cache": { revalidatePath(ruta) { revalidaciones.push(ruta); eventos.push({ tipo: "revalidacion", ruta }) } },
    "@/lib/supabase/server": { createClient: async () => opciones.sinConexion ? null : supabase },
    "@/lib/notificaciones": {
      async crearNotificacion(aviso) {
        avisos.push(normalizar(aviso))
        eventos.push({ tipo: "aviso" })
        if (opciones.errorAviso) throw new Error("Canal de notificaciones no disponible")
      },
    },
  }
  const modulo = { exports: {} }
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo, File, Buffer,
    console: { error() {}, info() {} },
    require(nombre) {
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
  }, { filename: ruta })
  return { acciones: modulo.exports, consultas, rpcs, revalidaciones, avisos, eventos, storage, lecturasSesion: () => lecturasSesion }
}

function conError(resultado) {
  assert.equal(typeof resultado.error, "string")
  assert.ok(resultado.error.length > 0)
  assert.equal(resultado.success, undefined)
  assert.equal(resultado.data, undefined)
}

function sinEfectos(f) {
  assert.equal(f.rpcs.length, 0)
  assert.equal(f.revalidaciones.length, 0)
  assert.equal(f.avisos.length, 0)
}

const revisionValida = { profesionalId: PROVEEDOR, estado: "verificado", actualizadaAt: "2026-09-09T20:00:00Z", identidadComprobada: true, cualificacionComprobada: true, notaInterna: "Identidad y cualificación comprobadas con evidencias." }
let casos = 0
async function comprobar(nombre, prueba) {
  await prueba()
  casos++
  console.log(`PASS ${nombre}`)
}

for (const [nombre, invocar] of [
  ["consulta propia", (a) => a.obtenerMiVerificacionProfesional()],
  ["solicitud", (a) => a.solicitarVerificacionProfesional("", ACREDITACION)],
  ["listado administrativo", (a) => a.obtenerSolicitudesVerificacionAdmin()],
  ["historial", (a) => a.obtenerHistorialVerificacionAdmin(PROVEEDOR)],
  ["revisión", (a) => a.revisarVerificacionProfesional(revisionValida)],
]) {
  await comprobar(`Sin sesión se deniega ${nombre} antes de consultar datos`, async () => {
    const f = preparar({ usuario: null })
    conError(await invocar(f.acciones))
    assert.equal(f.consultas.length, 0)
    sinEfectos(f)
  })
}

await comprobar("Una sesión con error no se usa aunque incluya un usuario", async () => {
  const f = preparar({ errorSesion: { message: "Sesión inválida" } })
  conError(await f.acciones.solicitarVerificacionProfesional("Mensaje", ACREDITACION))
  assert.equal(f.consultas.length, 0)
  sinEfectos(f)
})

await comprobar("Sin conexión no se devuelve un estado de verificación inventado", async () => {
  const f = preparar({ sinConexion: true })
  conError(await f.acciones.obtenerMiVerificacionProfesional())
  assert.equal(f.lecturasSesion(), 0)
  sinEfectos(f)
})

for (const [nombre, invocar] of [
  ["listado", (a) => a.obtenerSolicitudesVerificacionAdmin()],
  ["historial", (a) => a.obtenerHistorialVerificacionAdmin(PROVEEDOR)],
  ["revisión", (a) => a.revisarVerificacionProfesional(revisionValida)],
]) {
  await comprobar(`Un proveedor no administrador no accede a ${nombre}`, async () => {
    const f = preparar()
    conError(await invocar(f.acciones))
    assert.ok(f.consultas.every((q) => q.tabla === "profiles" && q.columnas === "es_admin"))
    assert.ok(f.consultas.every((q) => q.filtros.some((x) => x.campo === "id" && x.valor === PROVEEDOR)))
    sinEfectos(f)
  })
}

await comprobar("Un error al comprobar el administrador impide acceder a datos privados", async () => {
  const f = preparar({ usuario: { id: ADMIN }, errorConsulta: (q) => q.columnas === "es_admin" ? { code: "42501" } : null })
  conError(await f.acciones.obtenerHistorialVerificacionAdmin(PROVEEDOR))
  assert.equal(f.consultas.length, 1)
  sinEfectos(f)
})

await comprobar("Una cuenta cliente sin perfil profesional recibe un error", async () => {
  const f = preparar({ tablas: { profesionales: [] } })
  conError(await f.acciones.obtenerMiVerificacionProfesional())
  assert.equal(f.revalidaciones.length, 0)
})

await comprobar("La consulta del proveedor se limita a su identidad y excluye el historial interno", async () => {
  const f = preparar()
  const resultado = await f.acciones.obtenerMiVerificacionProfesional(AJENO)
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.data.solicitud.profesional_id, PROVEEDOR)
  assert.equal(resultado.data.empresa, null)
  assert.equal(JSON.stringify(resultado).includes(NOTA_INTERNA), false)
  assert.equal(f.consultas.some((q) => q.tabla === "historial_verificacion_profesional"), false)
  for (const q of f.consultas) assert.ok(q.filtros.some((filtro) => filtro.tipo === "eq" && filtro.valor === PROVEEDOR))
})

await comprobar("La empresa visible procede del perfil autenticado", async () => {
  const f = preparar({ tablas: { profiles: [{ id: PROVEEDOR, verificado: false, empresa_id: EMPRESA }] } })
  const resultado = await f.acciones.obtenerMiVerificacionProfesional()
  assert.deepEqual(normalizar(resultado.data.empresa), { id: EMPRESA, nombre: "Empresa sintética" })
  assert.ok(f.rpcs.some(rpc => rpc.nombre === "empresa_contexto_actual"))
})

await comprobar("Un error en los datos propios no se presenta como ausencia de solicitud", async () => {
  const f = preparar({ errorConsulta: (q) => q.tabla === "solicitudes_verificacion_profesional" ? { code: "42501" } : null })
  conError(await f.acciones.obtenerMiVerificacionProfesional())
  assert.equal(f.revalidaciones.length, 0)
})

await comprobar("Una empresa vinculada que no se puede consultar bloquea el resultado incompleto", async () => {
  const f = preparar({ tablas: { profiles: [{ id: PROVEEDOR, verificado: false, empresa_id: EMPRESA }], empresas: [] } })
  conError(await f.acciones.obtenerMiVerificacionProfesional())
})

for (const [nombre, mensaje] of [["mensaje nulo", null], ["identidad en lugar de mensaje", { profesionalId: AJENO }], ["mensaje demasiado largo", "x".repeat(2001)]]) {
  await comprobar(`La solicitud rechaza ${nombre} antes de consultar la base de datos`, async () => {
    const f = preparar()
    conError(await f.acciones.solicitarVerificacionProfesional(mensaje))
    assert.equal(f.lecturasSesion(), 0)
    sinEfectos(f)
  })
}

await comprobar("Solicitar envía el expediente y mensaje; la identidad procede de la sesión", async () => {
  const f = preparar()
  const resultado = await f.acciones.solicitarVerificacionProfesional("  Revisar mi perfil  ", ACREDITACION)
  assert.equal(resultado.success, true)
  assert.deepEqual(f.rpcs, [{ nombre: "solicitar_acreditacion_profesional", parametros: { p_mensaje: "Revisar mi perfil", p_datos: ACREDITACION } }])
  assert.ok(f.revalidaciones.includes(`/profesional/${PROVEEDOR}`))
  assert.equal(f.revalidaciones.some((ruta) => ruta.includes(AJENO)), false)
  assert.equal(f.avisos.length, 0)
})

await comprobar("El mensaje es opcional y acepta el límite válido de 2.000 caracteres", async () => {
  for (const mensaje of ["", "x".repeat(2000)]) {
    const f = preparar()
    assert.equal((await f.acciones.solicitarVerificacionProfesional(mensaje, ACREDITACION)).success, true)
    assert.equal(f.rpcs[0].parametros.p_mensaje, mensaje)
  }
})

for (const [nombre, invocar, rpc] of [
  ["solicitud", (a) => a.solicitarVerificacionProfesional("Mensaje", ACREDITACION), "solicitar_acreditacion_profesional"],
  ["revisión", (a) => a.revisarVerificacionProfesional(revisionValida), "revisar_acreditacion_profesional"],
]) {
  for (const [motivo, respuesta] of [["error", { data: null, error: { message: "Operación denegada" } }], ["sin resultado", { data: false, error: null }]]) {
    await comprobar(`La RPC de ${nombre} con ${motivo} no confirma, revalida ni avisa`, async () => {
      const f = preparar({ usuario: { id: ADMIN }, respuestasRpc: { [rpc]: respuesta } })
      conError(await invocar(f.acciones))
      assert.equal(f.rpcs.length, 1)
      assert.equal(f.revalidaciones.length, 0)
      assert.equal(f.avisos.length, 0)
    })
  }
}

for (const [nombre, parametros] of [
  ["sin parámetros", null],
  ["identificador inválido", { ...revisionValida, profesionalId: "otro-usuario" }],
  ["estado no permitido", { ...revisionValida, estado: "pendiente" }],
  ["sin versión del expediente", { profesionalId: PROVEEDOR, estado: "verificado" }],
  ["versión con fecha inválida", { ...revisionValida, actualizadaAt: "no-es-una-fecha" }],
  ["comentario con tipo inválido", { ...revisionValida, comentarioPublico: {} }],
  ["nota con tipo inválido", { ...revisionValida, notaInterna: 1 }],
  ["comentario demasiado largo", { ...revisionValida, comentarioPublico: "x".repeat(2001) }],
  ["nota demasiado larga", { ...revisionValida, notaInterna: "x".repeat(4001) }],
  ["rechazo sin motivo", { ...revisionValida, estado: "no_aprobado", comentarioPublico: "  " }],
  ["aprobación sin identidad revisada", { ...revisionValida, identidadComprobada: false }],
  ["aprobación sin cualificación revisada", { ...revisionValida, cualificacionComprobada: false }],
  ["aprobación sin comprobaciones detalladas", { ...revisionValida, notaInterna: "Breve" }],
  ["retirada sin motivo", { ...revisionValida, estado: "retirada", comentarioPublico: "" }],
]) {
  await comprobar(`La revisión rechaza ${nombre} antes de consultar datos`, async () => {
    const f = preparar({ usuario: { id: ADMIN } })
    conError(await f.acciones.revisarVerificacionProfesional(parametros))
    assert.equal(f.lecturasSesion(), 0)
    assert.equal(f.consultas.length, 0)
    sinEfectos(f)
  })
}

await comprobar("El historial rechaza identificadores inválidos antes de consultar datos", async () => {
  const f = preparar({ usuario: { id: ADMIN } })
  conError(await f.acciones.obtenerHistorialVerificacionAdmin("sin-id"))
  assert.equal(f.lecturasSesion(), 0)
  assert.equal(f.consultas.length, 0)
  sinEfectos(f)
})

await comprobar("Solo el administrador recibe el historial interno del proveedor solicitado", async () => {
  const f = preparar({ usuario: { id: ADMIN } })
  const resultado = await f.acciones.obtenerHistorialVerificacionAdmin(PROVEEDOR)
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.data.length, 1)
  assert.equal(resultado.data[0].nota_interna, NOTA_INTERNA)
  assert.equal(JSON.stringify(resultado).includes("NOTA_AJENA"), false)
  const consultasPrivadas = f.consultas.filter((q) => q.tabla === "historial_verificacion_profesional")
  assert.equal(consultasPrivadas.length, 1)
  assert.ok(consultasPrivadas[0].filtros.some((filtro) => filtro.campo === "profesional_id" && filtro.valor === PROVEEDOR))
  sinEfectos(f)
})

await comprobar("Un error al leer el historial no se transforma en historial vacío", async () => {
  const f = preparar({ usuario: { id: ADMIN }, errorConsulta: (q) => q.tabla === "historial_verificacion_profesional" ? { code: "42501" } : null })
  conError(await f.acciones.obtenerHistorialVerificacionAdmin(PROVEEDOR))
})

await comprobar("No se escribe una revisión si falla la lectura del estado anterior", async () => {
  const f = preparar({ usuario: { id: ADMIN }, errorConsulta: (q) => q.tabla === "solicitudes_verificacion_profesional" ? { code: "42501" } : null })
  conError(await f.acciones.revisarVerificacionProfesional(revisionValida))
  sinEfectos(f)
})

await comprobar("La revisión conserva la versión observada y su precisión al enviarla a la base de datos", async () => {
  const actualizadaAt = "2026-09-09T20:00:00.123456+00:00"
  const f = preparar({ usuario: { id: ADMIN } })
  assert.equal((await f.acciones.revisarVerificacionProfesional({ ...revisionValida, actualizadaAt })).success, true)
  assert.equal(f.rpcs[0].parametros.p_actualizada_at, actualizadaAt)
})

await comprobar("Una revisión obsoleta rechazada bajo bloqueo no anuncia ni publica una decisión", async () => {
  const f = preparar({
    usuario: { id: ADMIN },
    tablas: { solicitudes_verificacion_profesional: [solicitud(PROVEEDOR, { actualizada_at: "2026-09-09T21:00:00Z" })] },
    respuestasRpc: { revisar_acreditacion_profesional: { data: null, error: { code: "40001", message: "La solicitud ha cambiado" } } },
  })
  conError(await f.acciones.revisarVerificacionProfesional(revisionValida))
  assert.equal(f.rpcs[0].parametros.p_actualizada_at, revisionValida.actualizadaAt)
  assert.equal(f.revalidaciones.length, 0)
  assert.equal(f.avisos.length, 0)
})

await comprobar("La nota interna se guarda pero nunca se incluye en el aviso al proveedor", async () => {
  const f = preparar({ usuario: { id: ADMIN } })
  const resultado = await f.acciones.revisarVerificacionProfesional({
    ...revisionValida, estado: "no_aprobado", comentarioPublico: "  Corrige la descripción  ", notaInterna: `  ${NOTA_INTERNA}  `,
  })
  assert.equal(resultado.success, true)
  assert.equal(f.rpcs[0].parametros.p_nota_interna, NOTA_INTERNA)
  assert.equal(f.rpcs[0].parametros.p_comentario_publico, "Corrige la descripción")
  assert.equal(f.avisos.length, 1)
  assert.equal(f.avisos[0].usuarioId, PROVEEDOR)
  assert.equal(f.avisos[0].mensaje, "Corrige la descripción")
  assert.equal(JSON.stringify(f.avisos).includes(NOTA_INTERNA), false)
  assert.ok(f.eventos.findIndex((evento) => evento.tipo === "aviso") > f.eventos.findIndex((evento) => evento.tipo === "rpc"))
})

await comprobar("Una revisión sin comentario público tampoco filtra la nota interna", async () => {
  const f = preparar({ usuario: { id: ADMIN } })
  assert.equal((await f.acciones.revisarVerificacionProfesional({ ...revisionValida, notaInterna: NOTA_INTERNA })).success, true)
  assert.equal(f.avisos.length, 1)
  assert.equal(JSON.stringify(f.avisos).includes(NOTA_INTERNA), false)
})

await comprobar("Repetir una decisión del mismo estado no duplica el aviso al proveedor", async () => {
  const f = preparar({ usuario: { id: ADMIN }, tablas: { solicitudes_verificacion_profesional: [solicitud(PROVEEDOR, { estado: "verificado" })] } })
  assert.equal((await f.acciones.revisarVerificacionProfesional({ ...revisionValida, notaInterna: NOTA_INTERNA })).success, true)
  assert.equal(f.rpcs.length, 1)
  assert.equal(f.avisos.length, 0)
})

await comprobar("El fallo del aviso no convierte una revisión ya guardada en otro intento de escritura", async () => {
  const f = preparar({ usuario: { id: ADMIN }, errorAviso: true })
  assert.equal((await f.acciones.revisarVerificacionProfesional(revisionValida)).success, true)
  assert.equal(f.rpcs.length, 1)
  assert.equal(f.avisos.length, 1)
  assert.ok(f.revalidaciones.includes(`/profesional/${PROVEEDOR}`))
})

await comprobar("El listado administrativo obtiene el contacto por RPC y relaciona la empresa correcta", async () => {
  const f = preparar({ usuario: { id: ADMIN }, tablas: { solicitudes_verificacion_profesional: [solicitud(PROVEEDOR, { empresa_id: EMPRESA })] } })
  const resultado = await f.acciones.obtenerSolicitudesVerificacionAdmin()
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.data.length, 1)
  assert.equal(resultado.data[0].profesional_id, PROVEEDOR)
  assert.equal(resultado.data[0].email, `${PROVEEDOR}@example.test`)
  assert.equal(resultado.data[0].telefono, "600000000")
  assert.equal(resultado.data[0].empresa_nombre, "Empresa sintética")
  assert.deepEqual(f.rpcs.map(r => r.nombre), ["contacto_perfiles", "acreditaciones_profesionales_admin"])
  assert.equal(resultado.data[0].cuentaStripe, "acct_test")
  assert.deepEqual(normalizar(resultado.data[0].acreditacion), ACREDITACION)
  assert.equal(f.consultas.some((q) => q.tabla === "profiles" && /email|telefono/.test(q.columnas)), false)
})

await comprobar("Si falla el permiso de contacto no se muestra un listado parcialmente autorizado", async () => {
  const f = preparar({ usuario: { id: ADMIN }, respuestasRpc: { contacto_perfiles: { data: null, error: { code: "42501" } } } })
  conError(await f.acciones.obtenerSolicitudesVerificacionAdmin())
  assert.equal(f.revalidaciones.length, 0)
  assert.equal(f.avisos.length, 0)
})

await comprobar("Un listado vacío no consulta contactos ni empresas de otros usuarios", async () => {
  const f = preparar({ usuario: { id: ADMIN }, tablas: { solicitudes_verificacion_profesional: [] } })
  assert.deepEqual(normalizar((await f.acciones.obtenerSolicitudesVerificacionAdmin()).data), [])
  assert.equal(f.rpcs.length, 0)
  assert.equal(f.consultas.some((q) => ["empresas", "profesionales"].includes(q.tabla)), false)
})

await comprobar("El listado no pierde las solicitudes que superan una página de resultados", async () => {
  const solicitudes = Array.from({ length: 201 }, (_, indice) => solicitud(`${indice.toString(16).padStart(8, "0")}-3333-4333-8333-333333333333`))
  const f = preparar({ usuario: { id: ADMIN }, tablas: { solicitudes_verificacion_profesional: solicitudes } })
  const resultado = await f.acciones.obtenerSolicitudesVerificacionAdmin()
  assert.equal(resultado.error, undefined)
  assert.equal(resultado.data.length, 201)
  assert.equal(new Set(resultado.data.map((fila) => fila.profesional_id)).size, 201)
  const contactos = f.rpcs.filter((rpc) => rpc.nombre === "contacto_perfiles")
  assert.equal(new Set(contactos.flatMap((rpc) => rpc.parametros.p_ids)).size, 201)
  assert.equal(contactos.some((rpc) => rpc.parametros.p_ids.includes(AJENO)), false)
})

await comprobar("Un mensaje sin expediente no puede solicitar acreditación", async () => {
  const f = preparar()
  conError(await f.acciones.solicitarVerificacionProfesional("Revisar"))
  sinEfectos(f)
})

const formulario = (file, categoria = "identidad") => ({ get: key => key === "file" ? file : key === "categoria" ? categoria : null })
const pdf = () => new File(["%PDF-1.7\nDocumento sintético de prueba"], "identidad.pdf", { type: "application/pdf" })
for (const [nombre, file, categoria] of [
  ["sin archivo", null, "identidad"],
  ["contenido no PDF con extensión PDF", new File(["<script>contenido</script>"], "falso.pdf", { type: "application/pdf" }), "identidad"],
  ["imagen con formato permitido para otros adjuntos", new File([new Uint8Array([255, 216, 255, 0, 0, 0])], "foto.jpg"), "identidad"],
  ["PDF de 4 MiB más un byte", new File(["%PDF-", new Uint8Array(4 * 1024 * 1024 - 4)], "grande.pdf"), "identidad"],
  ["PDF del antiguo límite de 5 MiB", new File(["%PDF-", new Uint8Array(5 * 1024 * 1024 - 5)], "limite-anterior.pdf"), "identidad"],
  ["categoría desconocida", pdf(), "publico"],
]) await comprobar(`No sube ${nombre}`, async () => {
  const f = preparar()
  conError(await f.acciones.subirDocumentoAcreditacionProfesional(formulario(file, categoria)))
  assert.equal(f.storage.length, 0)
  assert.equal(f.rpcs.length, 0)
})
await comprobar("Subida sin sesión no escribe ni registra archivos", async () => {
  const f = preparar({ usuario: null })
  conError(await f.acciones.subirDocumentoAcreditacionProfesional(formulario(pdf())))
  assert.equal(f.storage.length, 0)
  sinEfectos(f)
})
await comprobar("PDF válido se guarda privado con propietario derivado de sesión y referencia canónica", async () => {
  const f = preparar(), file = pdf()
  const resultado = await f.acciones.subirDocumentoAcreditacionProfesional(formulario(file))
  assert.match(resultado.data.url, /^acreditacion:\/\/[0-9a-f-]{36}$/)
  assert.equal(resultado.data.categoria, "identidad")
  const upload = f.storage[0], registro = f.rpcs[0]
  assert.equal(upload.bucket, "acreditaciones-profesionales")
  assert.equal(upload.options.upsert, false)
  assert.equal(upload.ruta, `${PROVEEDOR}/${resultado.data.url.slice(15)}.pdf`)
  assert.equal(registro.nombre, "registrar_documento_acreditacion_profesional")
  assert.equal(registro.parametros.p_usuario_id, PROVEEDOR)
  assert.equal(registro.parametros.p_sha256, crypto.createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"))
  assert.equal(JSON.stringify(resultado).includes("https://"), false)
})
await comprobar("PDF de exactamente 4 MiB se admite y registra su tamaño exacto", async () => {
  const f = preparar()
  const file = new File(["%PDF-", new Uint8Array(4 * 1024 * 1024 - 5)], "limite.pdf", { type: "application/pdf" })
  assert.equal(file.size, 4 * 1024 * 1024)
  const resultado = await f.acciones.subirDocumentoAcreditacionProfesional(formulario(file))
  assert.equal(resultado.error, undefined)
  assert.match(resultado.data.url, /^acreditacion:\/\/[0-9a-f-]{36}$/)
  assert.equal(f.storage[0].bytes.length, file.size)
  assert.equal(f.rpcs[0].parametros.p_bytes, file.size)
})
await comprobar("Registro fallido limpia el PDF recién subido y no devuelve referencia utilizable", async () => {
  const f = preparar({ errorRegistro: { message: "error" } })
  conError(await f.acciones.subirDocumentoAcreditacionProfesional(formulario(pdf())))
  assert.equal(f.storage[1].tipo, "remove")
  assert.deepEqual(normalizar(f.storage[1].rutas), [f.storage[0].ruta])
})
await comprobar("Fallo de almacenamiento no registra metadata", async () => {
  const f = preparar({ errorSubida: { message: "error" } })
  conError(await f.acciones.subirDocumentoAcreditacionProfesional(formulario(pdf())))
  assert.equal(f.rpcs.length, 0)
})
await comprobar("La apertura rechaza URLs externas antes de firmar", async () => {
  const f = preparar()
  conError(await f.acciones.abrirDocumentoAcreditacionProfesional("https://otro.test/documento.pdf"))
  assert.equal(f.storage.length, 0)
  sinEfectos(f)
})
await comprobar("La referencia ajena rechazada por SQL nunca recibe URL firmada", async () => {
  const f = preparar({ respuestasRpc: { documento_acreditacion_profesional_metadata: { data: null, error: null } } })
  conError(await f.acciones.abrirDocumentoAcreditacionProfesional(ACREDITACION.documentos[0].url))
  assert.equal(f.storage.length, 0)
})
await comprobar("Solo la referencia autorizada por SQL se firma durante 60 segundos", async () => {
  const f = preparar()
  const resultado = await f.acciones.abrirDocumentoAcreditacionProfesional(ACREDITACION.documentos[0].url)
  assert.equal(resultado.data.url, "https://storage.test/private-signed")
  assert.equal(f.rpcs[0].nombre, "documento_acreditacion_profesional_metadata")
  assert.equal(f.storage[0].bucket, "acreditaciones-profesionales")
  assert.equal(f.storage[0].ttl, 60)
  assert.equal(f.storage[0].ruta, `${PROVEEDOR}/documento.pdf`)
})

console.log(`${casos} pruebas de acciones de verificación completadas, sin red ni base de datos.`)
