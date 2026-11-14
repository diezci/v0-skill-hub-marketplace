// Real local Auth/PostgREST acceptance and negotiation, without Stripe calls.
// Run with --run and DIIME_HITOS_QA_CREDENTIALS / DIIME_HITOS_QA_FIXTURE pointing
// to existing synthetic QA accounts. Every newly created record has a run tag.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'

if (!process.argv.includes('--run')) throw Error('Pass --run to create local synthetic negotiation fixtures.')
const directory = path.resolve(process.env.DIIME_HITOS_QA_DIR || '.build/hitos-stripe-test-20261114')
const credentialsPath = process.env.DIIME_HITOS_QA_CREDENTIALS
const fixturePath = process.env.DIIME_HITOS_QA_FIXTURE
assert.ok(credentialsPath && fixturePath, 'Provide the existing local QA credential and fixture files.')
const env = parseEnv(await fs.readFile(path.join(directory, '.env.supabase-local'), 'utf8'))
const base = new URL(env.NEXT_PUBLIC_SUPABASE_URL)
assert.equal(base.protocol, 'http:')
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Remote API forbidden')
assert.equal(base.port, '54321', 'Only the explicitly owned QA stack is allowed')
const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'))
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
const run = 'hitos-release-domain-' + randomUUID().slice(0, 8)
const companyOnly = process.argv.includes('--company-only')
const report = { run, scope: companyOnly ? 'company' : 'all', localOnly: true, api: base.origin, realAuth: true, realPostgrest: true, stripeCalls: false, startedAt: new Date().toISOString(), scenarios: [], records: [], passed: false }
const reportPath = path.join(directory, companyOnly ? 'negociacion-empresa-rest-report.json' : 'negociacion-rest-report.json')
const sessions = new Map()
const save = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 })
async function auth(alias) {
  if (sessions.has(alias)) return sessions.get(alias)
  const user = credentials.users[alias]
  assert.ok(user?.email.endsWith('@diime.test'), 'Only synthetic QA email identities are allowed')
  const r = await fetch(base.origin + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }), signal: AbortSignal.timeout(20000),
  })
  const data = await r.json()
  assert.equal(r.status, 200, `Auth ${alias}: ${r.status} ${data.error_description || ''}`)
  assert.equal(data.user.id, user.id)
  sessions.set(alias, data.access_token)
  return data.access_token
}
async function request(alias, route, body, method = 'POST') {
  const token = await auth(alias)
  const r = await fetch(base.origin + '/rest/v1/' + route, {
    method, headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
  })
  const text = await r.text()
  return { status: r.status, data: text ? JSON.parse(text) : null }
}
async function rpc(alias, name, body) { return request(alias, 'rpc/' + name, body) }
function ok(result, label) { assert.ok(result.status >= 200 && result.status < 300, `${label}: ${result.status} ${JSON.stringify(result.data)}`); return result.data }
function denied(result, label, code) { assert.ok(result.status >= 400, label + ': unexpectedly succeeded'); if (code) assert.equal(result.data?.code, code, label + ': ' + JSON.stringify(result.data)) }
async function scenario(name, fn) { if (companyOnly && name.startsWith('Personal')) return; const detail = await fn(); report.scenarios.push({ name, passed: true, ...detail }); await save(); console.log('PASS ' + name) }
const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
const plan = amounts => amounts.map((importe_centimos, i) => ({ id: randomUUID(), titulo: 'Fase ' + (i + 1), descripcion: 'Trabajo sintético de revisión eléctrica', criterio_aceptacion: 'Verificación conjunta del alcance entregado', fecha_limite: day, importe_centimos }))
const draft = items => items.map(({ id, titulo, descripcion, criterio_aceptacion, fecha_limite, importe_centimos }) => ({ id, titulo, descripcion, criterio_aceptacion, fecha_limite, importe_centimos: Number(importe_centimos) }))
async function offer(ca, pa, mode = 'hitos') {
  const suggestion = [{ id: randomUUID(), titulo: 'Primera revisión sugerida', descripcion: '', criterio_aceptacion: '', fecha_limite: '', importe_centimos: 0 }]
  const s = ok(await request(ca, 'solicitudes', {
    cliente_id: credentials.users[ca].id, empresa_id: ca.startsWith('CE_') ? fixture.companies.cliente.id : null,
    categoria_id: fixture.categories.general, titulo: run + ' ' + ca + ' ' + mode,
    descripcion: 'Revisión eléctrica sintética con dos entregas verificables para probar negociación local.', ubicacion: 'Madrid', urgencia: 'media', estado: 'abierta',
    presupuesto_min: 100, presupuesto_max: 100, modalidad_pago: mode, hitos_sugeridos: mode === 'hitos' ? suggestion : [],
  }), 'Create request')[0]
  report.records.push({ solicitud_id: s.id, ca, pa, mode }); await save()
  assert.equal(s.modalidad_pago, mode)
  if (mode === 'hitos') assert.equal(s.hitos_sugeridos[0].importe_centimos, 0)
  const o = ok(await request(pa, 'ofertas', {
    solicitud_id: s.id, profesional_id: credentials.users[pa].id, empresa_id: pa.startsWith('PE_') ? fixture.companies.proveedor.id : null,
    precio: 100, tiempo_estimado: 2, unidad_tiempo: 'dias', descripcion: 'Presupuesto sintético para revisión eléctrica por fases.', archivos: [],
    comision_proveedor_porcentaje: 10, comision_proveedor_minima: 2, comision_proveedor_prevista: 10, pago_neto_proveedor_previsto: 90,
    estado: 'pendiente', modalidad_pago: mode, plan_hitos: mode === 'hitos' ? plan([4000, 6000]) : [],
  }), 'Create offer')[0]
  Object.assign(report.records.at(-1), { oferta_id: o.id }); await save()
  return { s, o, ca, pa }
}
const getOffer = async (alias, o) => ok(await rpc(alias, 'obtener_plan_oferta', { p_oferta: o.id }), 'Read offer plan')
const getWork = async (alias, id) => ok(await rpc(alias, 'obtener_plan_hitos', { p_trabajo: id }), 'Read work plan ' + alias)
const proposeOffer = async (alias, o, items, version, mode = 'hitos') => ok(await rpc(alias, 'proponer_plan_oferta', { p_oferta: o.id, p_modalidad: mode, p_hitos: items, p_version: version }), 'Propose offer plan')
const respondOffer = (alias, o, version, accept) => rpc(alias, 'responder_plan_oferta', { p_oferta: o.id, p_version: version, p_aceptar: accept })
const contract = (alias, setup, version) => rpc(alias, 'aceptar_oferta_y_crear_trabajo', { p_oferta_id: setup.o.id, p_solicitud_id: setup.s.id, p_profesional_id: credentials.users[setup.pa].id, p_fecha_estimada_fin: null, ...(version === undefined ? {} : { p_plan_version: version }) })
const proposeWork = async (alias, id, items, version) => ok(await rpc(alias, 'proponer_plan_trabajo', { p_trabajo: id, p_modalidad: 'hitos', p_hitos: items, p_version: version }), 'Propose work plan')
const respondWork = (alias, id, version, accept) => rpc(alias, 'responder_plan_trabajo', { p_trabajo: id, p_version: version, p_aceptar: accept })
let personal, company
try {
  await scenario('Personal: suggested drafts, both offer views and counterpart-only consent', async () => {
    personal = await offer('CP', 'PP')
    const c = await getOffer('CP', personal.o), p = await getOffer('PP', personal.o)
    assert.equal(c.plan_version, 1); assert.equal(c.rol, 'cliente'); assert.equal(p.rol, 'proveedor')
    assert.equal(c.comision_proveedor_prevista, null); assert.equal(p.comision_proveedor_prevista, 10)
    const proposed = await proposeOffer('CP', personal.o, plan([2500, 2500, 5000]), c.plan_version)
    assert.equal(proposed.plan_hitos.length, 3); assert.equal(proposed.plan_aceptado_proveedor, false)
    denied(await respondOffer('CP', personal.o, proposed.plan_version, true), 'Same party cannot consent twice', '42501')
    denied(await contract('CP', personal, proposed.plan_version), 'Counteroffer cannot be contracted before provider consent')
    ok(await respondOffer('PP', personal.o, proposed.plan_version, false), 'Provider rejects counteroffer')
    assert.equal((await getOffer('CP', personal.o)).plan_estado, 'rechazado')
    return { draftAmountOptional: true, clientAddedMilestone: true, providerRejected: true }
  })
  await scenario('Personal: provider adds, client removes, stale response and stale contract are refused', async () => {
    let p = await getOffer('PP', personal.o)
    p = await proposeOffer('PP', personal.o, plan([4000, 6000]), p.plan_version)
    const stale = p.plan_version
    p = await proposeOffer('PP', personal.o, plan([4000, 4000, 2000]), p.plan_version)
    denied(await respondOffer('CP', personal.o, stale, true), 'Stale offer response', '40001')
    denied(await contract('CP', personal, stale), 'Stale contract acceptance', '40001')
    p = await proposeOffer('CP', personal.o, plan([5000, 5000]), p.plan_version)
    ok(await respondOffer('PP', personal.o, p.plan_version, true), 'Provider accepts exact counteroffer')
    const t = ok(await contract('CP', personal, p.plan_version), 'Contract current plan').trabajo
    personal.workId = t.id; report.records.find(r => r.oferta_id === personal.o.id).trabajo_id = t.id
    const work = await getWork('CP', t.id)
    assert.equal(work.modalidad_pago, 'hitos'); assert.equal(work.hitos.length, 2); assert.equal(work.plan_version, p.plan_version)
    assert.equal(work.hitos.reduce((sum, h) => sum + Number(h.importe_centimos), 0), 10000)
    denied(await rpc('AJ', 'obtener_plan_hitos', { p_trabajo: t.id }), 'Unrelated actor work snapshot', '42501')
    return { trabajo_id: t.id, agreedVersion: work.plan_version, milestoneCount: 2 }
  })
  await scenario('Personal contract: rejected revision preserves plan; mutual add and remove update exact version', async () => {
    const id = personal.workId
    let current = await getWork('CP', id)
    const three = [...draft(current.hitos), plan([2500])[0]]; three[1].importe_centimos = 2500
    let pending = await proposeWork('CP', id, three, current.plan_version)
    assert.equal(pending.hitos.length, 2); assert.equal(pending.puede_pagar, false)
    denied(await respondWork('CP', id, pending.propuesta.version, true), 'Proposer cannot accept own revision', '42501')
    current = ok(await respondWork('PP', id, pending.propuesta.version, false), 'Reject contract revision')
    assert.equal(current.hitos.length, 2); assert.equal(current.propuesta, null)
    pending = await proposeWork('PP', id, three, current.plan_version)
    const acceptedVersion = pending.propuesta.version
    current = ok(await respondWork('CP', id, acceptedVersion, true), 'Accept extra milestone')
    assert.equal(current.hitos.length, 3); assert.equal(current.plan_version, acceptedVersion)
    const two = draft(current.hitos).slice(0, 2); two[1].importe_centimos += Number(current.hitos[2].importe_centimos)
    pending = await proposeWork('CP', id, two, current.plan_version)
    denied(await respondWork('CP', id, acceptedVersion, true), 'Stale contract revision response', '40001')
    current = ok(await respondWork('PP', id, pending.propuesta.version, true), 'Accept removing unfunded milestone')
    assert.equal(current.hitos.length, 2)
    assert.equal(current.hitos.reduce((sum, h) => sum + Number(h.comision_proveedor_centimos), 0), 1000)
    const customer = await getWork('CP', id)
    assert.equal(customer.hitos.reduce((sum, h) => sum + Number(h.comision_cliente_centimos), 0), 1000)
    assert.ok(customer.hitos.every(h => !('comision_proveedor_centimos' in h)))
    return { mutualChanges: 2, finalVersion: current.plan_version, totalAndFeesPreserved: true }
  })
  await scenario('Personal single payment: legacy four-argument acceptance and retry remain intact', async () => {
    const setup = await offer('CP', 'PP', 'unico')
    const t = ok(await contract('CP', setup), 'Legacy one-time contract').trabajo
    report.records.find(r => r.oferta_id === setup.o.id).trabajo_id = t.id
    const retry = ok(await contract('CP', setup), 'Repeat legacy acceptance')
    assert.equal(retry.trabajo.id, t.id); assert.equal(retry.reutilizado, true)
    const dto = await getWork('CP', t.id)
    assert.equal(dto.modalidad_pago, 'unico'); assert.deepEqual(dto.hitos, [])
    denied(await rpc('CP', 'proponer_plan_trabajo', { p_trabajo: t.id, p_modalidad: 'hitos', p_hitos: plan([5000, 5000]), p_version: 0 }), 'Contracted single-payment mode remains fixed')
    return { trabajo_id: t.id, legacyRetrySameContract: true }
  })
  await scenario('Company: operators negotiate; authorized customer contracts the same agreed plan', async () => {
    company = await offer('CE_MIEMBRO', 'PE_MIEMBRO')
    let proposed = await proposeOffer('CE_MIEMBRO', company.o, plan([3000, 3000, 4000]), 1)
    proposed = ok(await respondOffer('PE_MIEMBRO', company.o, proposed.plan_version, true), 'Company provider accepts plan')
    const t = ok(await contract('CE_TITULAR', company, proposed.plan_version), 'Company customer owner contracts').trabajo
    company.workId = t.id; report.records.find(r => r.oferta_id === company.o.id).trabajo_id = t.id
    // Existing company rules assign the contract to the accepting operator.
    // The owner explicitly delegates this new fixture, without changing roles.
    denied(await rpc('CE_MIEMBRO', 'obtener_plan_hitos', { p_trabajo: t.id }), 'Unassigned customer operator', '42501')
    ok(await rpc('CE_TITULAR', 'empresa_reasignar_trabajo', { p_trabajo_id: t.id, p_usuario_id: credentials.users.CE_MIEMBRO.id, p_parte: 'cliente' }), 'Assign this synthetic work to customer operator')
    const operator = await getWork('PE_MIEMBRO', t.id), owner = await getWork('PE_TITULAR', t.id)
    assert.equal(operator.rol, 'proveedor'); assert.equal(owner.rol, 'proveedor'); assert.equal(operator.hitos.length, 3)
    assert.ok(operator.hitos.every(h => !('comision_cliente_centimos' in h) && !('comision_proveedor_centimos' in h)))
    assert.ok(owner.hitos.every(h => 'comision_proveedor_centimos' in h && !('comision_cliente_centimos' in h)))
    const customer = await getWork('CE_TITULAR', t.id), customerOperator = await getWork('CE_MIEMBRO', t.id)
    assert.equal(customer.puede_pagar, true); assert.equal(customerOperator.puede_pagar, false)
    assert.ok(customerOperator.hitos.every(h => !('comision_cliente_centimos' in h) && !('comision_proveedor_centimos' in h)))
    denied(await rpc('CE_REVOCADO', 'obtener_plan_hitos', { p_trabajo: t.id }), 'Revoked company member', '42501')
    return { trabajo_id: t.id, operatorFeesRedacted: true, ownerFeesRoleScoped: true, payerPermissionDistinct: true }
  })
  await scenario('Company contract: both operators can change unfunded stages, and workspace retains mode', async () => {
    const id = company.workId
    let work = await getWork('PE_MIEMBRO', id)
    const two = draft(work.hitos).slice(0, 2); two[1].importe_centimos += Number(work.hitos[2].importe_centimos)
    let pending = await proposeWork('PE_MIEMBRO', id, two, work.plan_version)
    work = ok(await respondWork('CE_MIEMBRO', id, pending.propuesta.version, true), 'Customer operator accepts removal')
    assert.equal(work.hitos.length, 2)
    const three = [...draft(work.hitos), plan([2000])[0]]; three[1].importe_centimos -= 2000
    pending = await proposeWork('CE_MIEMBRO', id, three, work.plan_version)
    work = ok(await respondWork('PE_MIEMBRO', id, pending.propuesta.version, true), 'Provider operator accepts addition')
    assert.equal(work.hitos.length, 3)
    const workspace = ok(await rpc('CE_TITULAR', 'empresa_workspace', {}), 'Company workspace')
    const visit = value => value && typeof value === 'object' && (value.id === id ? value : Object.values(value).map(visit).find(Boolean))
    const row = visit(workspace); assert.ok(row, 'Work present in workspace'); assert.equal(row.modalidad_pago, 'hitos'); assert.equal(row.plan_version, work.plan_version)
    return { mutualChanges: 2, finalVersion: work.plan_version, workspaceModeAndVersion: true }
  })
  await scenario('Company single payment: legacy mode and customer/provider DTOs remain available', async () => {
    const setup = await offer('CE_MIEMBRO', 'PE_MIEMBRO', 'unico')
    const t = ok(await contract('CE_TITULAR', setup), 'Company one-time contract').trabajo
    report.records.find(r => r.oferta_id === setup.o.id).trabajo_id = t.id
    for (const alias of ['CE_TITULAR', 'PE_TITULAR', 'PE_MIEMBRO']) {
      const work = await getWork(alias, t.id); assert.equal(work.modalidad_pago, 'unico'); assert.deepEqual(work.hitos, [])
    }
    return { trabajo_id: t.id }
  })
  report.passed = true
} catch (error) {
  report.error = { name: error.name, message: error.message }
  process.exitCode = 1
  console.error(error.message)
} finally {
  report.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ run, passed: report.passed, scenarios: report.scenarios.length, report: reportPath }))
}
