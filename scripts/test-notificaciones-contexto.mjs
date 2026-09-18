import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

// Exercise the actual helpers/actions with a small relational Supabase mock.
// No credentials, network requests, real accounts or database writes are used.
function cargar(ruta, dependencias = {}) {
  const codigo = ts.transpileModule(readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const modulo = { exports: {} }
  vm.runInNewContext(codigo, {
    exports: modulo.exports, module: modulo, URL, URLSearchParams, Date, Set,
    console: { error() {}, info() {}, warn() {} },
    require(nombre) {
      if (nombre in dependencias) return dependencias[nombre]
      throw new Error(`Dependencia sin simular: ${nombre}`)
    },
  }, { filename: ruta })
  return modulo.exports
}

const contexto = cargar("lib/notificaciones-contexto.ts")
const preferencias = cargar("lib/preferencias-notificaciones.ts")
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const YO = uuid(90001), OTRO = uuid(90002)
const SOLICITUD = uuid(80001), TRABAJO = uuid(80002), OFERTA = uuid(80003)
const plano = (valor) => JSON.parse(JSON.stringify(valor))

function aviso(numero, campos = {}) {
  return {
    id: uuid(numero), usuario_id: YO, tipo: "demanda_nueva", titulo: "Nueva solicitud",
    mensaje: "Tienes una solicitud que coincide con tus criterios.", link: "/demandas",
    leida: false, created_at: new Date(Date.UTC(2026, 8, 18) - numero * 1000).toISOString(),
    metadata: null, enlace: null, ...campos,
  }
}

function entorno(tablas = {}, opciones = {}) {
  const usuarioId = opciones.usuarioId === undefined ? YO : opciones.usuarioId
  const datos = structuredClone({ notificaciones: [], trabajos: [], solicitudes: [], ofertas: [], incidencias: [], conversaciones: [], mensajes: [], profiles: [], ...tablas })
  const consultas = [], escrituras = []
  const cliente = {
    auth: { getUser: async () => ({ data: { user: usuarioId ? { id: usuarioId } : null }, error: null }) },
    from(tabla) {
      const consulta = { tabla, filtros: [], orden: [], rango: null, limite: null, actualizacion: null, seleccion: null }
      const q = {
        select(campos, opcionesSelect) { consulta.seleccion = campos; consulta.opcionesSelect = opcionesSelect; return q },
        eq(columna, valor) { consulta.filtros.push(["eq", columna, valor]); return q },
        neq(columna, valor) { consulta.filtros.push(["neq", columna, valor]); return q },
        in(columna, valores) { consulta.filtros.push(["in", columna, [...valores]]); return q },
        or(expresion) { consulta.filtros.push(["or", expresion]); return q },
        order(columna, opcionesOrden) { consulta.orden.push([columna, opcionesOrden?.ascending !== false]); return q },
        range(desde, hasta) { consulta.rango = [desde, hasta]; return q },
        limit(numero) { consulta.limite = numero; return q },
        update(valores) { consulta.actualizacion = valores; return q },
        maybeSingle() { return ejecutar().then(r => ({ ...r, data: r.data?.[0] ?? null })) },
        then(resolve, reject) { return ejecutar().then(resolve, reject) },
      }
      async function ejecutar() {
        consultas.push(structuredClone(consulta))
        if (opciones.fallo?.(consulta)) return { data: null, error: { message: "Fallo simulado" }, count: null }
        let filas = datos[tabla] || []
        // Simulate row visibility, and also inspect explicit owner predicates
        // in assertions below so RLS does not conceal missing application guards.
        if (tabla === "notificaciones") filas = filas.filter(f => f.usuario_id === usuarioId)
        if (tabla === "trabajos") filas = filas.filter(f => f.cliente_id === usuarioId || f.profesional_id === usuarioId)
        if (tabla === "incidencias") filas = filas.filter(f => f.reportado_por === usuarioId)
        filas = filas.filter(f => consulta.filtros.every(([tipo, columna, valor]) => {
          if (tipo === "eq") return f[columna] === valor
          if (tipo === "neq") return f[columna] !== valor
          if (tipo === "in") return valor.includes(f[columna])
          return columna.split(",").some(expresion => {
            const [campo, operador, esperado] = expresion.split(".")
            assert.equal(operador, "eq")
            return f[campo] === esperado
          })
        }))
        if (consulta.actualizacion) {
          escrituras.push(structuredClone(consulta))
          for (const fila of filas) Object.assign(fila, consulta.actualizacion)
        }
        const count = filas.length
        filas = [...filas].sort((a, b) => {
          for (const [columna, asc] of consulta.orden) {
            if (a[columna] !== b[columna]) return (a[columna] < b[columna] ? -1 : 1) * (asc ? 1 : -1)
          }
          return 0
        })
        if (consulta.rango) filas = filas.slice(consulta.rango[0], consulta.rango[1] + 1)
        else filas = filas.slice(0, consulta.limite ?? 1000)
        return { data: structuredClone(filas), count, error: null }
      }
      return q
    },
  }
  const acciones = cargar("app/actions/notificaciones.ts", {
    "@/lib/i18n-servidor": { textoServidor: async texto => texto },
    "@/lib/supabase/server": { createClient: async () => opciones.sinCliente ? null : cliente },
    "next/cache": { revalidatePath() {} },
    "@/lib/notificaciones-contexto": contexto,
    "@/lib/preferencias-notificaciones": preferencias,
  })
  return { acciones, datos, consultas, escrituras }
}

let correctos = 0, fallidos = 0
async function comprobar(nombre, prueba) {
  try { await prueba(); correctos++; console.log(`PASS ${nombre}`) }
  catch (error) { fallidos++; console.error(`FAIL ${nombre}\n${error.stack}`) }
}

await comprobar("Pedro: el hash de verificación agrupa en Mi perfil y conserva el destino", () => {
  const n = contexto.contextualizarNotificacion(aviso(1, { tipo: "verificacion_aprobada", link: "/mi-perfil#verificacion" }))
  assert.equal(n.seccion, "/mi-perfil")
  assert.equal(n.aspecto, "Verificación")
  assert.equal(new URL(contexto.enlaceDeAviso(n), "https://www.diime.es").hash, "#verificacion")
  assert.equal(new URL(contexto.enlaceDeAviso(n), "https://www.diime.es").searchParams.get("notificacion"), n.id)
})

await comprobar("Los query params, hashes y barra final no separan avisos de la misma sección", () => {
  for (const link of ["/mis-trabajos", "/mis-trabajos/", `/mis-trabajos?trabajo=${TRABAJO}&aspecto=pago_liberado#entrega`]) {
    assert.equal(contexto.seccionDeNotificacion(link), "/mis-trabajos")
  }
})

await comprobar("Los enlaces externos, javascript y escapes no se navegan", () => {
  for (const link of ["https://evil.test", "//evil.test", "javascript:alert(1)", "/\\evil.test", "/ruta\nmaliciosa", "/ruta con espacio"]) {
    assert.equal(contexto.linkInternoNotificacion(link), null)
    const n = contexto.contextualizarNotificacion(aviso(1, { link }))
    assert.equal(n.seccion, "/notificaciones")
    assert.ok(n.link.startsWith("/notificaciones?"))
  }
})

await comprobar("Los avisos financieros enlazan trabajo, solicitud, oferta y aspecto exactos", () => {
  for (const tipo of ["pago_recibido", "pago_liberado", "reembolso_emitido", "disputa_ganada", "entrega_retrasada"]) {
    const link = contexto.construirLinkNotificacion({ seccion: "/mis-trabajos", trabajoId: TRABAJO, solicitudId: SOLICITUD, ofertaId: OFERTA, aspecto: tipo })
    const n = contexto.contextualizarNotificacion(aviso(1, { tipo, link, metadata: { titulo_trabajo: "Cocina de Ana" } }))
    assert.equal(n.trabajo_id, TRABAJO)
    assert.equal(n.solicitud_id, SOLICITUD)
    assert.equal(n.oferta_id, OFERTA)
    assert.equal(n.tituloEntidad, "Cocina de Ana")
    assert.equal(new URL(n.link, "https://www.diime.es").searchParams.get("aspecto"), tipo)
  }
})

await comprobar("Metadata legada recupera IDs y los títulos entre comillas conservan su texto", () => {
  const n = contexto.contextualizarNotificacion(aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", mensaje: 'El pago de \\"Reforma de Álvaro\\" está confirmado.', metadata: { trabajo_id: TRABAJO, solicitud_id: SOLICITUD } }))
  assert.equal(n.trabajo_id, TRABAJO)
  assert.equal(n.solicitud_id, SOLICITUD)
  assert.equal(n.tituloEntidad, "Reforma de Álvaro")
  assert.equal(contexto.contextualizarNotificacion(aviso(2, { metadata: { trabajo_id: "no-uuid" } })).trabajo_id, null)
})

await comprobar("Un aviso de un trabajo o puja no resalta sus hermanos de la misma solicitud", () => {
  const n = contexto.contextualizarNotificacion(aviso(1, { metadata: { trabajo_id: TRABAJO, solicitud_id: SOLICITUD, oferta_id: OFERTA } }))
  assert.equal(contexto.avisoPerteneceAEntidad(n, { trabajoId: TRABAJO, solicitudId: SOLICITUD }), true)
  assert.equal(contexto.avisoPerteneceAEntidad(n, { trabajoId: uuid(81000), solicitudId: SOLICITUD }), false)
  assert.equal(contexto.avisoPerteneceAEntidad(n, { ofertaId: uuid(81001), solicitudId: SOLICITUD }), false)
})

await comprobar("Pedro y una incidencia antigua siguen visibles después de más de 20 avisos nuevos", async () => {
  const filas = Array.from({ length: 25 }, (_, i) => aviso(i + 1))
  filas.push(aviso(100, { tipo: "verificacion_aprobada", link: "/mi-perfil#verificacion" }))
  filas.push(aviso(101, { tipo: "incidencia_respuesta", link: "/incidencias?incidencia=historica" }))
  filas.push(aviso(102, { leida: true }), aviso(103, { usuario_id: OTRO }))
  const e = entorno({ notificaciones: filas })
  const resumen = await e.acciones.obtenerResumenNotificaciones()
  assert.equal(resumen.noLeidas, 27)
  assert.equal(resumen.porSeccion["/mi-perfil"], 1)
  assert.equal(resumen.porSeccion["/incidencias"], 1)
  assert.deepEqual(plano((await e.acciones.obtenerNotificacionesSeccion("/incidencias")).data.map(n => n.id)), [uuid(101)])
  assert.equal(e.escrituras.length, 0)
  for (const q of e.consultas.filter(q => q.tabla === "notificaciones")) assert.ok(q.filtros.some(([op, campo, valor]) => op === "eq" && campo === "usuario_id" && valor === YO))
})

await comprobar("Se recorren todas las páginas de más de 1000 pendientes sin perder el más antiguo", async () => {
  const e = entorno({ notificaciones: Array.from({ length: 1205 }, (_, i) => aviso(i + 1, { link: i === 1204 ? "/mi-perfil#verificacion" : "/demandas" })) })
  const resumen = await e.acciones.obtenerResumenNotificaciones()
  assert.equal(resumen.noLeidas, 1205)
  assert.equal(new Set(resumen.notificaciones.map(n => n.id)).size, 1205)
  assert.equal(resumen.porSeccion["/mi-perfil"], 1)
  assert.deepEqual(e.consultas.filter(q => q.tabla === "notificaciones").map(q => q.rango), [[0, 499], [500, 999], [1000, 1499]])
  assert.equal(e.escrituras.length, 0)
})

await comprobar("Una página fallida devuelve error sin ofrecer un contador parcial como completo", async () => {
  const e = entorno({ notificaciones: Array.from({ length: 501 }, (_, i) => aviso(i + 1)) }, { fallo: q => q.tabla === "notificaciones" && q.rango?.[0] === 500 })
  const resumen = await e.acciones.obtenerResumenNotificaciones()
  assert.ok(resumen.error)
  assert.equal(resumen.noLeidas, 0)
  assert.equal(resumen.notificaciones.length, 0)
})

await comprobar("Los avisos consultados por una sección mantienen sus IDs particulares", async () => {
  const e = entorno({ notificaciones: [aviso(1, { link: `/mis-trabajos?trabajo=${TRABAJO}&solicitud=${SOLICITUD}` }), aviso(2, { link: `/mis-trabajos/?trabajo=${uuid(80004)}#entrega` }), aviso(3)] })
  const { data } = await e.acciones.obtenerNotificacionesSeccion("/mis-trabajos?trabajo=otra-vista")
  assert.deepEqual(plano(data.map(n => n.id)), [uuid(1), uuid(2)])
  assert.equal(e.escrituras.length, 0)
})

await comprobar("Un enlace externo inválido permite recuperar el enlace interno legado de la sección", async () => {
  const e = entorno({ notificaciones: [aviso(1, { link: "https://evil.test", enlace: "/mi-perfil#verificacion" })] })
  assert.equal((await e.acciones.obtenerResumenNotificaciones()).porSeccion["/mi-perfil"], 1)
  const { data } = await e.acciones.obtenerNotificacionesSeccion("/mi-perfil")
  assert.equal(data.length, 1)
  assert.equal(data[0].id, uuid(1))
})

await comprobar("Marcar IDs deduplicados afecta solo avisos seleccionados del propietario autenticado", async () => {
  const e = entorno({ notificaciones: [aviso(1), aviso(2), aviso(3, { usuario_id: OTRO })] })
  const { success } = await e.acciones.marcarNotificacionesLeidasPorIds([uuid(1), uuid(1)])
  assert.equal(success, true)
  assert.deepEqual(e.datos.notificaciones.map(n => n.leida), [true, false, false])
  assert.equal(e.escrituras.length, 1)
  assert.ok(e.escrituras[0].filtros.some(([op, campo, valor]) => op === "eq" && campo === "usuario_id" && valor === YO))
  assert.deepEqual(e.escrituras[0].filtros.find(([op, campo]) => op === "in" && campo === "id")[2], [uuid(1)])
})

await comprobar("Un ID ajeno no marca notificaciones de otra cuenta ni todos los avisos propios", async () => {
  const e = entorno({ notificaciones: [aviso(1), aviso(2, { usuario_id: OTRO })] })
  assert.ok((await e.acciones.marcarNotificacionesLeidasPorIds([uuid(2)])).error)
  assert.deepEqual(e.datos.notificaciones.map(n => n.leida), [false, false])
})

await comprobar("IDs inválidos, lotes excesivos, falta de sesión y lista vacía no escriben", async () => {
  const e = entorno({ notificaciones: [aviso(1)] })
  for (const ids of [["malicioso"], Array.from({ length: 501 }, (_, i) => uuid(i + 1)), null]) assert.ok((await e.acciones.marcarNotificacionesLeidasPorIds(ids)).error)
  assert.equal((await e.acciones.marcarNotificacionesLeidasPorIds([])).success, true)
  assert.equal(e.escrituras.length, 0)
  const anonimo = entorno({ notificaciones: [aviso(1)] }, { usuarioId: null })
  assert.ok((await anonimo.acciones.marcarNotificacionesLeidasPorIds([uuid(1)])).error)
  assert.equal((await anonimo.acciones.obtenerResumenNotificaciones()).noLeidas, 0)
  assert.equal((await anonimo.acciones.obtenerNotificacionesSeccion("/demandas")).data.length, 0)
  assert.equal(anonimo.escrituras.length, 0)
})

await comprobar("Un título legado único enlaza el trabajo del participante y sus IDs coherentes", async () => {
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", mensaje: 'Pago de "Reforma" confirmado.' })],
    trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, oferta_id: OFERTA, titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "en_progreso" }],
    solicitudes: [{ id: SOLICITUD, titulo: "Reforma", cliente_id: OTRO }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.trabajo_id, TRABAJO)
  assert.equal(n.solicitud_id, SOLICITUD)
})

await comprobar("Dos trabajos y solicitudes con el mismo título no inventan una asociación", async () => {
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", mensaje: 'Pago de "Reforma" confirmado.' })],
    trabajos: [1, 2].map(i => ({ id: uuid(82000 + i), solicitud_id: uuid(83000 + i), titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "en_progreso" })),
    solicitudes: [1, 2].map(i => ({ id: uuid(83000 + i), titulo: "Reforma", cliente_id: OTRO })),
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.trabajo_id, null)
  assert.equal(n.solicitud_id, null)
  assert.equal(n.tituloEntidad, "Reforma")
})

await comprobar("No se mezcla un trabajo propio con otra solicitud pública de título coincidente", async () => {
  const equivocada = uuid(84000)
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", mensaje: 'Pago de "Reforma" confirmado.' })],
    trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "en_progreso" }],
    solicitudes: [{ id: equivocada, titulo: "Reforma", cliente_id: OTRO }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.notEqual(n.solicitud_id, equivocada)
  if (n.trabajo_id === TRABAJO) assert.equal(n.solicitud_id, SOLICITUD)
})

await comprobar("Un trabajo ajeno invisible por RLS no sirve para enriquecer un aviso legado", async () => {
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", mensaje: 'Pago de "Privado" confirmado.' })],
    trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, titulo: "Privado", profesional_id: OTRO, cliente_id: uuid(90003), estado: "en_progreso" }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.trabajo_id, null)
  assert.equal(n.solicitud_id, null)
})

await comprobar("Los IDs explícitos de metadata evitan inferencias por títulos homónimos", async () => {
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "pago_recibido", link: "/mis-trabajos", metadata: { trabajo_id: TRABAJO, solicitud_id: SOLICITUD, titulo_trabajo: "Reforma" } })],
    trabajos: [{ id: uuid(84000), solicitud_id: uuid(84001), titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "en_progreso" }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.trabajo_id, TRABAJO)
  assert.equal(n.solicitud_id, SOLICITUD)
  assert.notEqual(n.trabajo_id, uuid(84000))
  assert.notEqual(n.solicitud_id, uuid(84001))
})

await comprobar("Una puja trasladada a proyecto lleva sus avisos a Gestión de proyectos", async () => {
  for (const estado of ["en_progreso", "completado", "cancelado", "pendiente_pago"]) {
    const e = entorno({
      notificaciones: [aviso(1, { tipo: "oferta_aceptada", link: `/mis-ofertas?oferta=${OFERTA}&solicitud=${SOLICITUD}` })],
      trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, oferta_id: OFERTA, titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado }],
      solicitudes: [{ id: SOLICITUD, titulo: "Reforma", cliente_id: OTRO }],
      ofertas: [{ id: OFERTA, solicitud_id: SOLICITUD, profesional_id: YO }],
    })
    const seccion = estado === "pendiente_pago" ? "/mis-ofertas" : "/mis-trabajos"
    const resumen = await e.acciones.obtenerResumenNotificaciones()
    assert.equal(resumen.porSeccion[seccion], 1, estado)
    const { data } = await e.acciones.obtenerNotificacionesSeccion(seccion)
    assert.equal(data.length, 1, estado)
    assert.equal(data[0].oferta_id, OFERTA)
    if (estado !== "pendiente_pago") assert.equal(data[0].trabajo_id, TRABAJO)
    assert.equal(new URL(data[0].link, "https://www.diime.es").pathname, seccion)
  }
})

await comprobar("Una oferta distinta para la misma solicitud no hereda el trabajo de otra puja", async () => {
  const otraOferta = uuid(84005)
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "oferta_rechazada", link: `/mis-ofertas?oferta=${otraOferta}&solicitud=${SOLICITUD}` })],
    trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, oferta_id: OFERTA, titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "en_progreso" }],
    ofertas: [{ id: otraOferta, solicitud_id: SOLICITUD, profesional_id: YO }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.seccion, "/mis-ofertas")
  assert.equal(n.oferta_id, otraOferta)
  assert.equal(n.trabajo_id, null)
})

await comprobar("Un aviso de demanda de título ambiguo no hereda una solicitud de un trabajo anterior", async () => {
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "demanda_nueva", link: "/demandas", mensaje: 'Nueva solicitud "Reforma".' })],
    trabajos: [{ id: TRABAJO, solicitud_id: SOLICITUD, titulo: "Reforma", profesional_id: YO, cliente_id: OTRO, estado: "completado" }],
    solicitudes: [{ id: SOLICITUD, titulo: "Reforma", cliente_id: OTRO }, { id: uuid(84009), titulo: "Reforma", cliente_id: uuid(90003) }],
  })
  const n = (await e.acciones.obtenerResumenNotificaciones()).notificaciones[0]
  assert.equal(n.solicitud_id, null)
  assert.equal(n.trabajo_id, null)
})

await comprobar("La incidencia histórica de Pedro se resuelve solo entre las reportadas por él", async () => {
  const propia = uuid(85001), ajena = uuid(85002)
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "incidencia_respuesta", link: "/incidencias", mensaje: 'Hay respuesta en "No puedo verificarme".' })],
    incidencias: [{ id: propia, asunto: "No puedo verificarme", reportado_por: YO }, { id: ajena, asunto: "No puedo verificarme", reportado_por: OTRO }],
  })
  const n = (await e.acciones.obtenerNotificacionesSeccion("/incidencias")).data[0]
  assert.equal(n.incidencia_id, propia)
  assert.equal(new URL(n.link, "https://www.diime.es").searchParams.get("incidencia"), propia)
  assert.ok(e.consultas.filter(q => q.tabla === "incidencias").every(q => q.filtros.some(([op, campo, valor]) => op === "eq" && campo === "reportado_por" && valor === YO)))
  assert.equal(e.escrituras.length, 0)
})

await comprobar("Incidencias ajenas o asuntos propios ambiguos no aportan IDs a un aviso legado", async () => {
  for (const incidencias of [
    [{ id: uuid(85002), asunto: "Ayuda", reportado_por: OTRO }],
    [{ id: uuid(85003), asunto: "Ayuda", reportado_por: YO }, { id: uuid(85004), asunto: "Ayuda", reportado_por: YO }],
  ]) {
    const e = entorno({ notificaciones: [aviso(1, { tipo: "incidencia_respuesta", link: "/incidencias", mensaje: 'Respuesta en "Ayuda".' })], incidencias })
    const n = (await e.acciones.obtenerNotificacionesSeccion("/incidencias")).data[0]
    assert.equal(n.incidencia_id, null)
    assert.equal(new URL(n.link, "https://www.diime.es").searchParams.get("incidencia"), null)
  }
})

await comprobar("Una incidencia encontrada por ID y por asunto cuenta una sola vez al resolver avisos antiguos", async () => {
  const id = uuid(85005)
  const e = entorno({
    notificaciones: [aviso(1, { tipo: "incidencia_respuesta", link: `/incidencias?incidencia=${id}` }), aviso(2, { tipo: "incidencia_respuesta", link: "/incidencias", mensaje: 'Respuesta en "Ayuda".' })],
    incidencias: [{ id, asunto: "Ayuda", reportado_por: YO }],
  })
  const { data } = await e.acciones.obtenerNotificacionesSeccion("/incidencias")
  assert.equal(data.length, 2)
  assert.ok(data.every(n => n.incidencia_id === id))
})

await comprobar("El historial pagina sin marcar avisos ni mostrar filas de otros usuarios", async () => {
  const e = entorno({ notificaciones: [...Array.from({ length: 61 }, (_, i) => aviso(i + 1, { leida: true })), aviso(100, { usuario_id: OTRO })] })
  const primera = await e.acciones.obtenerHistorialNotificaciones(0)
  const segunda = await e.acciones.obtenerHistorialNotificaciones(1)
  const tercera = await e.acciones.obtenerHistorialNotificaciones(2)
  assert.equal(primera.data.length, 30)
  assert.equal(primera.hayMas, true)
  assert.equal(segunda.data.length, 30)
  assert.equal(segunda.hayMas, true)
  assert.equal(tercera.data.length, 1)
  assert.equal(tercera.hayMas, false)
  assert.equal(new Set([...primera.data, ...segunda.data, ...tercera.data].map(n => n.id)).size, 61)
  assert.equal(e.escrituras.length, 0)
})

console.log(`${correctos} pruebas correctas, ${fallidos} fallidas; sin red ni datos reales.`)
if (fallidos) process.exitCode = 1
