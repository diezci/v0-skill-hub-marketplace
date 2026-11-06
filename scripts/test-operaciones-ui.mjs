// Component-level tests with transport doubles, not browser E2E.
import fs from'node:fs';import vm from'node:vm';import ts from'typescript';import assert from'node:assert/strict';import { createRequire } from'node:module'
// Use the production formatter so absent and one-sided budgets retain their meaning.
const utils = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/utils.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: utils, require: createRequire(import.meta.url), Intl, Date })
const rows=Array.from({length:63},(_,i)=>({id:`e${i}`,mensaje:`Evento ${i}`,severidad:'aviso',area:'sistema',codigo:'qa',ocurrencias:1})),keys=['eventos','webhooksError','webhooksAtascados','liquidacionesError','liquidacionesAtascadas','disputasVencidas','incidenciasCriticas','solicitudesSinOferta'];const summary={total:63,alertasTecnicas:63,alertasOperacion:0,generadoAt:'2026-10-14T10:00:00Z',detalle:Object.fromEntries(keys.map(k=>[k,k==='eventos'?rows.slice(0,25):[]])),totales:Object.fromEntries(keys.map(k=>[k,k==='eventos'?63:0]))}
function setup({result=summary,error='',denied=false,transport={}}={}){let cursor=0;const states=[result,false,null,error,null],calls=[],toasts=[];const exports={};const jsx=(type,props)=>({type,props});const deps={'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},react:{useState(initial){const n=cursor++;if(!(n in states))states[n]=initial;return[states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v}]},useEffect(){}},'@/lib/i18n':{localeDe:()=> 'es-ES'},'@/lib/utils':utils,'@/components/idioma-provider':{useIdioma:()=>({t:x=>x,idioma:'es'})},'@/hooks/use-toast':{useToast:()=>({toast:x=>toasts.push(x)})},'@/app/actions/operaciones':{obtenerEstadoOperativo:async()=>{if(transport.summary)throw Error('Synthetic transport interruption');return{ok:true,data:summary}},resolverEventoOperativo:async()=>{if(transport.resolve)throw Error('Synthetic transport interruption');return{success:true}},obtenerPaginaOperativa:async(category,from)=>{calls.push({category,from});if(transport.page)throw Error('Synthetic transport interruption');return denied?{ok:false,error:'Consulta fallida'}:{ok:true,data:{total:63,filas:rows.slice(from,from+25)}}}}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/admin/operaciones/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Set,console,require(name){if(name in deps)return deps[name];return new Proxy({},{get:(_t,k)=>String(k)})}});return{states,calls,toasts,render(){cursor=0;return exports.default()}}}
function nodes(node,out=[]){if(!node||typeof node!=='object')return out;if(Array.isArray(node)){node.forEach(x=>nodes(x,out));return out}out.push(node);nodes(node.props?.children,out);return out}
function text(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(text).join(' ');if(typeof node==='object')return text(node.props?.children);return String(node)}
let checks=0
{const h=setup({result:null,error:'Consulta fallida'}),tree=h.render();assert.match(text(tree),/Consulta fallida/);assert.doesNotMatch(text(tree),/No hay elementos fuera de SLA/);checks++;console.log('PASS unavailable data is not an all-clear')}
{const h=setup();let tree=h.render();assert.equal(h.states[0].totales.eventos,63);for(const from of[25,50]){const button=nodes(tree).find(n=>n.type==='Button'&&text(n)==='Cargar más');assert.ok(button);await button.props.onClick();assert.equal(h.calls.at(-1).from,from);tree=h.render()}assert.equal(h.states[0].detalle.eventos.length,63);assert.equal(h.states[0].totales.eventos,63);assert.equal(nodes(tree).some(n=>n.type==='Button'&&text(n)==='Cargar más'),false);checks++;console.log('PASS all 63 rows reachable in three pages with exact count')}
{const h=setup({denied:true}),tree=h.render(),button=nodes(tree).find(n=>n.type==='Button'&&text(n)==='Cargar más');await button.props.onClick();assert.equal(h.states[0].detalle.eventos.length,25);assert.equal(h.states[2],null);assert.equal(h.toasts[0].description,'Consulta fallida');checks++;console.log('PASS failed page retains rows/count and allows retry')}
// Thrown transport failures differ from an action's returned {ok:false}.
// They must leave the same retry path usable for first load, refresh and pagination.
{
  const transport={summary:true},h=setup({result:null,transport})
  let tree=h.render(),button=nodes(tree).find(n=>n.type==='Button'&&text(n).trim()==='Actualizar')
  await button.props.onClick()
  tree=h.render()
  assert.equal(h.states[1],false)
  assert.match(text(tree),/No se puede conectar con Diime/)
  assert.doesNotMatch(text(tree),/No hay elementos fuera de SLA/)
  assert.equal(nodes(tree).find(n=>n.type==='Button'&&text(n).trim()==='Actualizar').props.disabled,false)
  transport.summary=false
  await nodes(tree).find(n=>n.type==='Button'&&text(n).trim()==='Actualizar').props.onClick()
  assert.equal(h.states[0].total,63)
  assert.equal(h.states[3],'')
  assert.equal(h.states[1],false)
  transport.summary=true
  tree=h.render()
  await nodes(tree).find(n=>n.type==='Button'&&text(n).trim()==='Actualizar').props.onClick()
  assert.equal(h.states[0].total,63)
  assert.equal(h.states[0].detalle.eventos.length,25)
  assert.equal(h.states[1],false)
  checks++;console.log('PASS thrown first-load/refresh failure preserves data and enables recovery')
}
{
  const transport={page:true},h=setup({transport})
  let tree=h.render()
  await nodes(tree).find(n=>n.type==='Button'&&text(n)==='Cargar más').props.onClick()
  assert.equal(h.states[2],null)
  assert.equal(h.states[0].detalle.eventos.length,25)
  assert.equal(h.states[0].totales.eventos,63)
  assert.match(h.toasts[0].description,/No se puede conectar con Diime/)
  transport.page=false
  tree=h.render()
  await nodes(tree).find(n=>n.type==='Button'&&text(n)==='Cargar más').props.onClick()
  assert.equal(h.states[0].detalle.eventos.length,50)
  assert.equal(h.states[2],null)
  checks++;console.log('PASS thrown pagination failure keeps cursor/count and retry adds next page once')
}
{
  const transport={resolve:true},h=setup({transport})
  let tree=h.render()
  await nodes(tree).find(n=>n.type==='Button'&&text(n)==='Marcar resuelto').props.onClick()
  assert.equal(h.states[4],null)
  assert.equal(h.states[0].detalle.eventos.length,25)
  assert.equal(h.toasts[0].title,'No se pudo resolver')
  transport.resolve=false
  tree=h.render()
  await nodes(tree).find(n=>n.type==='Button'&&text(n)==='Marcar resuelto').props.onClick()
  assert.equal(h.states[4],null)
  assert.equal(h.toasts.at(-1).title,'Evento resuelto')
  checks++;console.log('PASS thrown resolution failure leaves its button available for an idempotent retry')
}
{
  const demandas = [
    { id: '00000000-0000-4000-8000-000000000001', titulo: 'Reparar persiana', ubicacion: 'Bilbao', created_at: '2026-10-12T10:00:00Z', descripcion: 'La persiana no sube.\nRevisar motor y cinta.', presupuesto_min: 120, presupuesto_max: 240, urgencia: 'alta', fecha_necesaria: '2026-11-10', cliente_id: '00000000-0000-4000-8000-000000000101', ofertas: [] },
    { id: '00000000-0000-4000-8000-000000000002', titulo: 'Pintar despacho', ubicacion: 'Barcelona', created_at: '2026-10-13T09:00:00Z', descripcion: null, presupuesto_min: null, presupuesto_max: null, urgencia: null, fecha_necesaria: null, cliente_id: null, ofertas: [] },
  ]
  const result = { total: 2, alertasTecnicas: 0, alertasOperacion: 2, generadoAt: summary.generadoAt, detalle: Object.fromEntries(keys.map(k => [k, k === 'solicitudesSinOferta' ? demandas : []])), totales: Object.fromEntries(keys.map(k => [k, k === 'solicitudesSinOferta' ? 2 : 0])) }
  const tree = setup({ result }).render()
  assert.match(text(tree), /Demandas sin ofertas tras 24 h/)
  assert.match(text(tree), /al menos 24 horas.*cualquier ubicación/)
  assert.match(text(tree), /Reparar persiana.*Bilbao.*Publicada el/)
  assert.match(text(tree), /Pintar despacho.*Barcelona/)
  assert.doesNotMatch(text(tree), /Madrid, abiertas|piloto de Madrid|"created_at"|"ofertas"/)
  assert.ok(nodes(tree).some(n => n.props?.id === 'demandas-sin-oferta'))
  assert.equal(nodes(tree).some(n => typeof n.props?.href === 'string' && n.props.href.startsWith('/demandas')), false)
  const articles = nodes(tree).filter(n => n.type === 'article')
  assert.equal(articles.length, 2)
  assert.equal(nodes(tree).filter(n => n.type === 'pre').length, 0)
  for (const article of articles) {
    const details = nodes(article).filter(n => n.type === 'details')
    assert.equal(details.length, 1)
    const children = [].concat(details[0].props.children).filter(Boolean)
    assert.equal(children[0].type, 'summary', 'native disclosure starts with its accessible summary')
    assert.equal(text(children[0]), 'Ver demanda')
    assert.equal(details[0].props.open, undefined, 'details start collapsed')
    assert.ok(nodes(details[0]).some(n => n.type === 'dt' && text(n) === 'Presupuesto'))
    assert.ok(nodes(details[0]).some(n => n.type === 'dt' && text(n) === 'Urgencia'))
  }
  assert.match(text(articles[0]), /La persiana no sube\.\nRevisar motor y cinta\./)
  assert.match(text(articles[0]), /120€ - 240€/)
  assert.match(text(articles[0]), /Urgencia Alta/)
  const deadline = nodes(articles[0]).find(n => n.type === 'time' && n.props.dateTime === demandas[0].fecha_necesaria)
  assert.ok(deadline)
  assert.equal(text(deadline), new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date('2026-11-10')))
  const client = nodes(articles[0]).find(n => n.props?.href === `/admin/usuarios/${demandas[0].cliente_id}`)
  assert.ok(client)
  assert.equal(text(client), 'Ver cliente')
  checks++;console.log('PASS native request detail exposes fields and exact admin client link without public navigation')

  assert.match(text(articles[1]), /Sin descripción/)
  assert.match(text(articles[1]), /Presupuesto A convenir/)
  assert.match(text(articles[1]), /Urgencia No indicada/)
  assert.doesNotMatch(text(articles[1]), /0€|Fecha necesaria|Ver cliente|Invalid Date/)
  assert.equal(nodes(articles[1]).filter(n => n.type === 'time').length, 1, 'missing deadline leaves only the publication date')
  assert.equal(nodes(articles[1]).some(n => n.props?.href), false)
  checks++;console.log('PASS absent budget, description, urgency, deadline and client remain explicitly unspecified')

  for (const [urgencia, etiqueta] of [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta'], ['urgente', 'Urgente']]) {
    const one = { ...demandas[0], urgencia, presupuesto_min: null, presupuesto_max: 500 }
    const variant = { ...result, detalle: { ...result.detalle, solicitudesSinOferta: [one] } }
    const article = nodes(setup({ result: variant }).render()).find(n => n.type === 'article')
    assert.ok(nodes(article).some(n => n.type === 'dd' && text(n) === etiqueta))
    assert.match(text(article), /Presupuesto Hasta 500€/)
  }
  checks++;console.log('PASS all urgency labels and a ceiling-only budget retain their published meaning')

  const empty = { ...result, total: 0, alertasOperacion: 0, detalle: { ...result.detalle, solicitudesSinOferta: [] }, totales: { ...result.totales, solicitudesSinOferta: 0 } }
  const emptyTree = setup({ result: empty }).render()
  assert.ok(nodes(emptyTree).some(n => n.props?.id === 'demandas-sin-oferta'))
  assert.match(text(emptyTree), /No hay demandas abiertas sin ofertas registradas tras 24 h/)
  const staleTree = setup({ result: empty, error: 'Consulta fallida' }).render()
  assert.doesNotMatch(text(staleTree), /No hay demandas abiertas sin ofertas registradas tras 24 h|No hay elementos fuera de SLA/)
  checks++;console.log('PASS request anchor remains available at zero and stale errors never show an all-clear')
}
console.log(`${checks} operational UI regressions passed`)
