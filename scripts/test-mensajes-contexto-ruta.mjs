import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
// Execute the real component callback; no duplicated route-selection logic.
const source=fs.readFileSync('components/mensajes-content.tsx','utf8'),ast=ts.createSourceFile('messages.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let callback;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleVerProyecto')callback=node.initializer.getText(ast);ts.forEachChild(node,visit)}visit(ast);assert.ok(callback)
let destination=null;const env={selectedConversation:null,enPanelAdmin:false,URLSearchParams,router:{push:url=>destination=url}};vm.createContext(env);vm.runInContext(ts.transpileModule('globalThis.openProject = '+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,env)
let checks=0;function route(conversation,expected,admin=false){env.selectedConversation=conversation;env.enPanelAdmin=admin;destination=null;env.openProject();assert.equal(destination,expected);checks++}
const base={solicitud_id:'request',trabajo_id:null,mi_rol:'proveedor',empresarial:true,empresa_2_id:'provider-company'}
route(base,'/demandas?solicitud=request')
route({...base,trabajo_id:'contract'},'/mi-empresa?solicitud=request&trabajo=contract')
route({...base,mi_rol:'cliente',empresa_1_id:'client-company'},'/mi-empresa?solicitud=request')
route({...base,empresarial:false},'/demandas?solicitud=request')
route({...base,empresarial:false,trabajo_id:'contract'},'/mis-trabajos?solicitud=request&trabajo=contract')
route({...base,empresarial:false,mi_rol:'cliente'},'/mis-solicitudes?solicitud=request')
route({...base,mi_rol:'cliente',empresa_1_id:null},'/mis-solicitudes?solicitud=request')
route(base,'/demandas?solicitud=request',true)
route({...base,trabajo_id:'contract'},'/admin/trabajos?solicitud=request&trabajo=contract',true)
route({...base,solicitud_id:'request&trabajo=foreign'},'/demandas?solicitud=request%26trabajo%3Dforeign')
route(null,null)
console.log(`OK: ${checks} rutas del callback real; oferta empresarial, contrato, ambos lados y administración sin red.`)
