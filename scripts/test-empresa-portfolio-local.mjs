// Real local persistence and request boundaries, with external services forbidden.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { File } from 'node:buffer'
import ts from 'typescript'
const temp = await mkdtemp(path.join(os.tmpdir(), 'diime-portfolio-local-'))
const require = createRequire(import.meta.url)
let checks = 0
const check = (value, message) => { assert.ok(value, message); checks++ }
const good = r => { assert.equal(r.error, undefined, r.error); return r.data }
const bad = (r, pattern) => { assert.match(r.error || '', pattern); checks++ }
try {
  const modules = path.join(temp, 'modules'); await mkdir(modules)
  for (const name of ['types', 'seed', '../categorias', '../provincias', '../precios', 'local-store']) {
    const source = await readFile(`lib/empresas/${name}.ts`, 'utf8')
    await writeFile(path.join(modules, `${name}.js`), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText)
  }
  const { EmpresaLocalStore } = require(path.join(modules, 'local-store.js'))
  const { ACTORES_EMPRESA_LOCAL: actors } = require(path.join(modules, 'seed.js'))
  const previousDir = process.env.DIIME_EMPRESAS_LOCAL_DIR, previousMode = process.env.NODE_ENV
  try {
    process.env.DIIME_EMPRESAS_LOCAL_DIR = path.join(temp, 'isolated-preview')
    process.env.NODE_ENV = 'development'
    check(new EmpresaLocalStore().directorio === process.env.DIIME_EMPRESAS_LOCAL_DIR, 'Demo directory isolates the fixture from other local sessions')
    process.env.NODE_ENV = 'production'
    check(new EmpresaLocalStore().directorio !== process.env.DIIME_EMPRESAS_LOCAL_DIR, 'Production ignores the local directory override')
  } finally {
    if (previousDir === undefined) delete process.env.DIIME_EMPRESAS_LOCAL_DIR; else process.env.DIIME_EMPRESAS_LOCAL_DIR = previousDir
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode
  }
  const store = new EmpresaLocalStore(path.join(temp, 'state'))
  const initialPublic = await store.publica('reformas-garcia')
  check(initialPublic.empresa.proyectosCompletados === 4 && initialPublic.trabajos.length === 3, 'Completed count includes this company’s contracts outside portfolio and excludes foreign or unfinished work')
  const env = { DIIME_EMPRESAS_LOCAL: '1', NODE_ENV: 'development' }
  let host = '127.0.0.1:3200', actor = 'owner', realReads = 0, blobCalls = 0, invalidations = 0
  async function load(filename, deps) {
    const exports = {}
    const source = await readFile(filename, 'utf8')
    new Function('require', 'exports', 'process', 'File', 'FormData', 'Response', 'Buffer', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => {
      if (name === 'server-only') return {}
      if (name in deps) return deps[name]
      throw Error(`Unmocked dependency ${name}`)
    }, exports, { env }, File, FormData, Response, Buffer)
    return exports
  }
  const service = await load('lib/empresas/service.ts', {
    'next/headers': { headers: async () => new Headers({host}), cookies: async () => ({get: () => ({value: actor})}) },
    './seed': { ACTORES_EMPRESA_LOCAL: actors }, './local-store': { empresaLocalStore: store }, './production-store': {},
  })
  const common = {
    '@/lib/empresas/service': service, '@/lib/empresas/local-store': { empresaLocalStore: store },
    '@/lib/supabase/server': { createClient: async () => { realReads++; return null } },
  }
  const actions = await load('app/actions/portfolio-empresa.ts', {
    ...common, 'next/cache': { revalidatePath() { invalidations++ } },
    '@/lib/i18n-servidor': { textoServidor: async s => s }, '@/lib/moderacion': { errorContenidoProhibido: () => null },
  })
  const reviews = await load('app/actions/portfolio-acreditacion.ts', { ...common, 'next/cache': { revalidatePath() { invalidations++ } } })
  const draft = { titulo: 'Proyecto externo local', descripcion: 'Descripción del trabajo realizado fuera de Diime.', imagen_url: '', categoria: 'Pintura', fecha_completado: '2026-10-20', evidencia_acreditacion: 'Factura privada ref-local-001 y fotografías disponibles.', presupuesto: '2345.67' }
  const external = good(await actions.crearItemPortfolioEmpresa({...draft, acreditacion:'acreditado'}))
  let own = good(await actions.obtenerPortfolioEmpresa()).find(p => p.id === external.id)
  check(own.acreditacion === 'pendiente' && own.evidencia_acreditacion === draft.evidencia_acreditacion, 'External stays pending with owner evidence')
  check(!(await store.publica('reformas-garcia')).trabajos.some(p => p.id === external.id), 'Pending external never appears in public preview')
  const reopened = new EmpresaLocalStore(store.directorio)
  check(good(await reopened.portfolio(actors.owner)).some(p => p.id === external.id), 'External persists after a new store instance')
  bad(await actions.crearItemPortfolioEmpresa({...draft,evidencia_acreditacion:'corta'}), /evidencias/)
  bad(await actions.actualizarItemPortfolioEmpresa('foreign-project',draft), /no está disponible/)
  const choices = good(await actions.obtenerTrabajosCompletadosParaPortfolioEmpresa())
  check(choices.length === 4 && choices.every(p => !['contrato-en-curso','contrato-otra-empresa'].includes(p.id)), 'Picker contains only this company’s completed contracts')
  for (const trabajo_id of ['contrato-en-curso','contrato-otra-empresa','forged']) bad(await actions.crearItemPortfolioEmpresa({...draft,trabajo_id}), /no está disponible/)
  const linked = good(await actions.crearItemPortfolioEmpresa({...draft,trabajo_id:'contrato-pintura-completado',titulo:'Forged title',descripcion:'Forged description',evidencia_acreditacion:''}))
  own = good(await actions.obtenerPortfolioEmpresa()).find(p => p.id === linked.id)
  check(own.acreditacion === 'diime' && own.titulo === 'Pintura de un piso en Madrid' && own.descripcion !== 'Forged description', 'Verified content comes from the company contract')
  const publicLinked = (await store.publica('reformas-garcia')).trabajos.find(p => p.id === linked.id)
  check(publicLinked.trabajoId === 'contrato-pintura-completado' && !JSON.stringify(publicLinked).includes('2345.67') && !('evidencia_acreditacion' in publicLinked), 'Public projection has completed link and no exact budget/evidence')
  const reviewInput = {tipo:'empresa',itemId:external.id,revisionId:external.id,decision:'acreditado',nota:'Referencias de prueba comprobadas por el equipo.'}
  for (const identity of ['owner','ana','mario','cliente']) {
    actor=identity; bad(await reviews.listarAcreditacionesPortfolio(), /Solo el equipo/)
    bad(await reviews.revisarAcreditacionPortfolio(reviewInput), /Solo el equipo/)
  }
  bad(await store.acreditacionesPortfolio({...actors.owner,plataformaAdmin:true}), /identidad/)
  actor='admin'
  let queue=good(await reviews.listarAcreditacionesPortfolio())
  check(queue.length===1 && queue[0].item_id===external.id && queue[0].evidencia_acreditacion===draft.evidencia_acreditacion,'Only external projects enter the private review queue with their evidence')
  reviewInput.revisionId=queue[0].revision_id
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,nota:'breve'}), /motivo/)
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,nota:'n'.repeat(2001)}), /motivo/)
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,decision:'inventado'}), /decisión/)
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,tipo:'personal'}), /no está disponible/)
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,itemId:linked.id}), /no está disponible/)
  bad(await reviews.revisarAcreditacionPortfolio({...reviewInput,revisionId:'stale'}), /ha cambiado/)
  check((await reviews.revisarAcreditacionPortfolio({...reviewInput,decision:'requiere_informacion',nota:'Añade referencias de las facturas del trabajo.'})).success,'Admin can request information with a note')
  check(!(await store.publica('reformas-garcia')).trabajos.some(p=>p.id===external.id),'Information request keeps project private')
  actor='owner'
  check(good(await actions.obtenerPortfolioEmpresa()).find(p=>p.id===external.id).nota_acreditacion.includes('facturas'),'Owner receives review note')
  good(await actions.actualizarItemPortfolioEmpresa(external.id,{...draft,descripcion:'Descripción del trabajo completada con las facturas.'}))
  actor='admin'
  bad(await reviews.revisarAcreditacionPortfolio(reviewInput), /ha cambiado/)
  queue=good(await reviews.listarAcreditacionesPortfolio())
  reviewInput.revisionId=queue[0].revision_id
  check(queue[0].estado==='pendiente'&&queue[0].nota===null,'Resubmission creates a fresh pending review')
  check((await reviews.revisarAcreditacionPortfolio(reviewInput)).success,'Admin approves the current documented revision')
  const published=(await store.publica('reformas-garcia')).trabajos.find(p=>p.id===external.id)
  check(published.acreditacion==='acreditado'&&!JSON.stringify(published).includes(draft.evidencia_acreditacion),'Accredited external becomes public without private evidence')
  actor='owner'
  good(await actions.actualizarItemPortfolioEmpresa(external.id,draft))
  check(!(await store.publica('reformas-garcia')).trabajos.some(p=>p.id===external.id),'Editing an accredited project immediately removes public approval')
  good(await actions.actualizarItemPortfolioEmpresa(linked.id,draft))
  check(good(await actions.obtenerPortfolioEmpresa()).find(p => p.id === linked.id).acreditacion === 'pendiente', 'Unlinking returns an external project to review')
  good(await store.eliminarProyectoPortfolio(actors.owner,linked.id))
  check(good(await actions.obtenerTrabajosCompletadosParaPortfolioEmpresa()).some(t => t.id === 'contrato-pintura-completado'), 'Deleting a portfolio card does not delete its contract')
  for (const a of ['mario','cliente','admin','invitado']) {
    actor=a;bad(await actions.crearItemPortfolioEmpresa(draft), /permiso/);bad(await actions.obtenerPortfolioEmpresa(), /permiso/)
  }
  actor='unknown';bad(await actions.obtenerPortfolioEmpresa(), /identidad local/)
  actor='owner';host='evil.example';bad(await actions.crearItemPortfolioEmpresa(draft), /localhost/)
  actor='admin';bad(await reviews.listarAcreditacionesPortfolio(), /localhost/);bad(await reviews.revisarAcreditacionPortfolio(reviewInput), /localhost/);actor='owner'
  check(realReads===0, 'Invalid local host never falls back to real Supabase')
  host='localhost:3200'
  const upload = await load('app/api/empresas/_lib/subir-imagen.ts', {...common,
    '@vercel/blob': { put: async()=>{blobCalls++;throw Error('External Blob forbidden')}, del: async()=>{blobCalls++;throw Error('External Blob forbidden')} },
    'next/server': { NextResponse: Response },
  })
  const reader = await load('app/api/empresas/imagen-local/[id]/route.ts', common)
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
  async function imageRequest(kind, bytes=png, mime='image/png', company='reformas-garcia') {
    const form=new FormData();form.append('file',new File([bytes],'image.png',{type:mime}));form.append('empresaId',company)
    const response=await upload.subirImagenEmpresa({headers:new Headers({'content-type':'multipart/form-data; boundary=test'}),formData:async()=>form},kind)
    return {status:response.status,body:await response.json()}
  }
  let imageUrl
  for(const kind of ['logo','portada','portfolio']) {
    const result=await imageRequest(kind);assert.equal(result.status,200);imageUrl=result.body.url
    const response=await reader.GET(null,{params:Promise.resolve({id:imageUrl.split('/').at(-1)})})
    check(response.status===200 && response.headers.get('content-type')==='image/png' && Buffer.from(await response.arrayBuffer()).equals(png), `${kind} upload is stored locally and served intact`)
  }
  good(await actions.actualizarItemPortfolioEmpresa(external.id,{...draft,imagen_url:imageUrl}))
  check(good(await actions.obtenerPortfolioEmpresa()).find(p=>p.id===external.id).imagenes[0]===imageUrl,'Portfolio can persist its local image')
  const before = good(await store.espacio(actors.owner)).empresa
  good(await store.guardarPerfil(actors.owner,{nombre:before.nombre,descripcion:`${before.descripcion} Edición local.`,web:before.web,ubicacion:before.ubicacion,servicios:before.servicios,portadaUrl:'/kitchen-renovation-open-concept.jpg'}))
  check(good(await store.espacio(actors.owner)).empresa.descripcion.endsWith('Edición local.'),'Text edits save while keeping the supplied local cover')
  good(await store.guardarPerfil(actors.owner,{nombre:before.nombre,descripcion:before.descripcion,web:before.web,ubicacion:before.ubicacion,servicios:before.servicios,logoUrl:imageUrl,portadaUrl:imageUrl}))
  check((await store.publica('reformas-garcia')).empresa.logoUrl===imageUrl,'Logo and cover accept owned local files')
  for(const [body,mime,company] of [[png,'image/png','otra-empresa'],['<svg/>','image/png','reformas-garcia'],[png,'image/svg+xml','reformas-garcia'],[new Uint8Array(3*1024*1024+1),'image/png','reformas-garcia']]) check((await imageRequest('portfolio',body,mime,company)).status>=400,'Unsafe/oversized/foreign upload denied')
  actor='mario';check((await imageRequest('logo')).status===403,'Image upload checks profile permission')
  actor='owner';host='not-local.example';check((await imageRequest('portada')).status>=400,'Remote host cannot upload through local mode')
  check((await reader.GET(null,{params:Promise.resolve({id:imageUrl.split('/').at(-1)})})).status===404,'Remote host cannot read local files')
  host='localhost';check((await reader.GET(null,{params:Promise.resolve({id:'../../state.json'})})).status===404,'Image endpoint rejects traversal')
  env.NODE_ENV='production';check((await reader.GET(null,{params:Promise.resolve({id:imageUrl.split('/').at(-1)})})).status===404,'Local endpoint is closed in production even with local flag')
  await actions.obtenerPortfolioEmpresa();check(realReads===1,'Production ignores local fixture and uses real client path')
  await reviews.listarAcreditacionesPortfolio();check(realReads===2,'Review queue also ignores local fixture in production')
  check(blobCalls===0 && invalidations>0,'No external upload and mutations invalidate UI paths')
  // Migration is additive for the fixture users have already edited.
  const disk=JSON.parse(await readFile(path.join(store.directorio,'state.json'),'utf8'))
  delete disk.proyectosPortfolio;delete disk.contratosPortfolio;delete disk.imagenesEmpresa;disk.empresa.nombre='Edited legacy fixture'
  await writeFile(path.join(store.directorio,'state.json'),JSON.stringify(disk))
  const legacy=await store.publica('reformas-garcia')
  check(legacy.empresa.nombre==='Edited legacy fixture'&&legacy.trabajos.length===3,'Legacy fixture upgrades without losing profile edits')
  console.log(`PASS ${checks} local portfolio/image checks: private pending projects, own completed contracts, permissions, persistence, localhost and production isolation; no external services.`)
} finally { await rm(temp,{recursive:true,force:true}) }
