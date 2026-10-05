// Controlled receipt data. Loads the actual page and resolves its async server
// children; authentication/database/printing side effects are replaced only here.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
const require=createRequire(import.meta.url)
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename)
export const comisiones=require('../../lib/comisiones.ts')
const {traducir}=require('../../lib/i18n.ts')
export const texto=tree=>Array.isArray(tree)?tree.map(texto).join(''):tree&&typeof tree==='object'?texto(tree.props?.children):typeof tree==='string'||typeof tree==='number'?String(tree):''
export const nodos=tree=>Array.isArray(tree)?tree.flatMap(nodos):!tree?.props?[]:[tree,...nodos(tree.props.children)]
export const dinero=(n,idioma='es')=>new Intl.NumberFormat(idioma==='en'?'en-GB':'es-ES',{style:'currency',currency:'EUR'}).format(Number(n||0))
export async function resolver(tree){
 if(Array.isArray(tree))return Promise.all(tree.map(resolver))
 if(!tree?.props)return tree
 if(typeof tree.type==='function')return resolver(await tree.type(tree.props))
 return {...tree,props:{...tree.props,children:await resolver(tree.props.children)}}
}
export function datosFactura({rol='cliente',pagado=true,empresa=false,escrow={},oferta=null}={}){
 return {
  trabajo:{id:'abc00001-0000-4000-8000-000000000001',titulo:'Pintura del salón',precio_acordado:100,estado:pagado?'completado':'pendiente_pago',created_at:'2026-10-05T12:00:00Z'},
  cliente:{nombre:'Cliente',apellido:'de ejemplo',ubicacion:'Madrid'},profesional:{nombre:'Ana',apellido:'Profesional',ubicacion:'Madrid'},oferta,solicitud:null,
  escrow:pagado?{monto:110,monto_base:100,comision_cliente:10,comision_cliente_retenida:10,comision_proveedor:5,pago_neto_proveedor:95,monto_bruto_proveedor:100,monto_reembolsado:0,estado:'completado',liquidacion_estado:'completada',fecha_retencion:'2026-10-05T12:00:00Z',...escrow}:null,
  esCliente:rol==='cliente',esProfesional:rol==='proveedor',esAdmin:rol==='admin',contratado:pagado,
  facturacionCliente:{persona_nombre:'Cliente',persona_apellido:'de ejemplo',persona_documento:'DOCUMENTO DE PRUEBA'},
  facturacionProfesional:empresa?{empresa_nombre:'Reformas Ejemplo S.L.',empresa_cif:'B00000000',empresa_ubicacion:'Madrid',persona_nombre:'Ana',persona_apellido:'Profesional',persona_cargo:'Operadora'}:null,
 }
}
export async function renderFactura(opts={}){
 const {idioma='es',vista,datos=datosFactura(opts)}=opts
 const t=(key,params)=>traducir(idioma,key,params)
 const before=JSON.stringify(datos)
 const deps={
  'react/jsx-runtime':jsx,
  '@/lib/i18n-servidor':{getT:async()=>({t,idioma})},
  'next/navigation':{notFound(){throw Error('NOT_FOUND')}},
  '@/lib/comisiones':comisiones,
  '@/components/boton-imprimir':{BotonImprimir:()=>jsx.jsx('button',{type:'button',className:'no-print',children:t('Imprimir / Guardar PDF')})},
  '@/components/adjuntos-lista':{AdjuntosLista:()=>null},
  '@/components/diime-logo':{DiimeLogo:props=>jsx.jsx('img',{...props,src:'/brand.svg',alt:''})},
  '../datos':{obtenerDatosContratacion:async()=>datos,formatearEuros:dinero,formatearFechaLarga:value=>value?new Date(value).toLocaleDateString(idioma==='en'?'en-GB':'es-ES'):'—',etiquetaMateriales:()=>t('No especificado')},
 }
 const module={exports:{}}
 const code=ts.transpileModule(readFileSync(new URL('../../app/trabajos/[id]/factura/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 vm.runInNewContext(code,{module,exports:module.exports,Date,Intl,console,require(name){if(!(name in deps))throw Error(`Unexpected dependency ${name}`);return deps[name]}})
 const tree=await resolver(await module.exports.default({params:Promise.resolve({id:datos?.trabajo.id||'unknown'}),searchParams:Promise.resolve({vista})}))
 if(JSON.stringify(datos)!==before)throw Error('Receipt render changed persisted fixture amounts')
 return tree
}
