import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the component's actual URL writer and synchronization effect while
// server navigation is stalled. No reimplementation of the selection algorithm.
const source = fs.readFileSync('components/mensajes-content.tsx', 'utf8')
const ast = ts.createSourceFile('messages.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let writer, sync
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'actualizarUrlConversacion') writer = node.initializer.getText(ast)
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const convId = searchParams')) sync = node.arguments[0].getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(writer && sync)
const compile = code => ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
let href = 'http://127.0.0.1:3200/mensajes', writes = 0, clears = 0, selections = []
const env = {
  searchParams:new URL(href).searchParams,
  navegacionConversacion:{current:null}, autoSelectId:{current:''}, conversacionActual:{current:null},
  enPanelAdmin:false, loading:false, conversations:[{id:'A'},{id:'B'},{id:'C'}],
  router:{replace(){throw Error('Server navigation is deliberately unavailable')}},
  window:{history:{replaceState(state,title,url){assert.equal(state,null); href=new URL(url,href).href; writes++}}},
  setActiveTab(){},setSearchQuery(){},limpiarConversacion(){clears++;env.conversacionActual.current=null},
  handleSelectConversation(conv){selections.push(conv.id);env.conversacionActual.current=conv.id},
}
vm.createContext(env)
vm.runInContext(compile(`globalThis.writeUrl = ${writer}; globalThis.syncUrl = ${sync}`),env)
let checks=0
const equal=(a,b,msg)=>{assert.equal(a,b,msg);checks++}
env.writeUrl('A');env.conversacionActual.current='A'
equal(new URL(href).searchParams.get('c'),'A','The URL persists immediately while server navigation is unavailable')
env.syncUrl();equal(clears,0,'Stale searchParams cannot close the just-selected chat')
env.writeUrl('B');env.conversacionActual.current='B'
equal(new URL(href).searchParams.get('c'),'B','A rapid second click persists the latest conversation')
env.searchParams=new URL('http://127.0.0.1:3200/mensajes?c=A').searchParams
env.syncUrl();equal(selections.length,0,'Late intermediate URL cannot reopen A')
env.searchParams=new URL(href).searchParams;env.syncUrl()
equal(env.navegacionConversacion.current,null,'Current URL completes the transition')
equal(env.autoSelectId.current,'B')
const before=writes;env.writeUrl('B');equal(writes,before,'Same destination does not rewrite history')
env.writeUrl('');env.conversacionActual.current=null
equal(new URL(href).pathname+new URL(href).search,'/mensajes','Closing a chat removes its reload target')
env.searchParams=new URL(href).searchParams;env.syncUrl()
env.enPanelAdmin=true;env.writeUrl('private/id?c=other')
equal(new URL(href).pathname,'/admin/mensajes')
equal(new URL(href).searchParams.get('c'),'private/id?c=other','IDs cannot inject other URL parameters')
// A genuine browser history entry has no pending click and remains selectable.
env.navegacionConversacion.current=null;env.autoSelectId.current='';env.searchParams=new URL('http://127.0.0.1:3200/mensajes?c=C').searchParams
env.syncUrl();equal(selections.at(-1),'C','External/history URL still opens its own conversation')
console.log(`OK: ${checks} comprobaciones reales de sincronización URL/chat sin red ni navegación de servidor.`)
