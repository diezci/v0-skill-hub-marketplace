import assert from 'node:assert/strict'
import {renderFactura,datosFactura,nodos,texto,dinero,comisiones} from './fixtures/factura-render.mjs'
const bloques=tree=>nodos(tree).filter(n=>n.type==='section'&&n.props['aria-label'])
const filas=block=>nodos(block).filter(n=>n.type==='dl').flatMap(n=>nodos(n).filter(x=>x.type==='div').map(x=>[texto(x.props.children[0]),texto(x.props.children[1])]))
let count=0
async function test(name,fn){await fn();count++;console.log(`PASS ${name}`)}
function importes(block,base,iva,total){assert.deepEqual(filas(block),[['Base imponible',dinero(base)],['Tipo de IVA','21 %'],['Cuota de IVA',dinero(iva)],['Total gastos Diime (IVA incluido)',dinero(total)]])}
await test('Client fee is split 8.26 + 1.74 = 10 without taxing service price or changing 110 total',async()=>{
 const tree=await renderFactura();assert.equal(bloques(tree).length,1);importes(bloques(tree)[0],8.26,1.74,10);assert.match(texto(tree),/Total pagado por el cliente110,00/);assert.doesNotMatch(texto(tree),/Gastos Diime del proveedor/)
})
await test('Historical provider 5% fee keeps 4.13 + 0.87 = 5 and 95 net, for person and company',async()=>{
 for(const empresa of[false,true]){const tree=await renderFactura({rol:'proveedor',empresa});importes(bloques(tree)[0],4.13,.87,5);assert.match(texto(tree),/Neto a percibir por el profesional95,00/);assert.doesNotMatch(texto(tree),/Gastos Diime del cliente/);if(empresa)assert.match(texto(tree),/Reformas Ejemplo S.L.CIF: B00000000/)}
})
await test('Each user view ignores forged query overrides; administrator can select either side',async()=>{
 for(const[rol,vista,title]of[['cliente','proveedor','cliente'],['proveedor','cliente','proveedor'],['admin','cliente','cliente'],['admin','proveedor','proveedor']]){const tree=await renderFactura({rol,vista});assert.equal(bloques(tree).length,1);assert.match(bloques(tree)[0].props['aria-label'],new RegExp(title))}
 assert.equal(bloques(await renderFactura({rol:'admin'})).length,2)
})
await test('Paid cancellation retains only recorded client fee; full historic refund retains zero',async()=>{
 for(const[retained,refund,base,vat]of[[10,100,8.26,1.74],[1.25,108.75,1.03,.22],[0,110,0,0]]){const tree=await renderFactura({escrow:{estado:'reembolsado',comision_cliente_retenida:retained,monto_reembolsado:refund}});assert.equal(bloques(tree).length,2);importes(bloques(tree)[0],8.26,1.74,10);importes(bloques(tree)[1],base,vat,retained)}
})
await test('Provider partial settlement uses recorded 3 fee and cancellation uses explicit zero',async()=>{
 let tree=await renderFactura({rol:'proveedor',escrow:{monto_reembolsado:40,monto_bruto_proveedor:60,comision_proveedor:3,pago_neto_proveedor:57}});importes(bloques(tree)[0],2.48,.52,3);assert.match(texto(tree),/Neto a percibir por el profesional57,00/)
 tree=await renderFactura({rol:'proveedor',escrow:{estado:'reembolsado',monto_reembolsado:100,monto_bruto_proveedor:0,comision_proveedor:0,pago_neto_proveedor:0}});importes(bloques(tree)[0],0,0,0)
})
await test('Missing recorded fees or net are unknown, never synthesized from current tariff or offer',async()=>{
 for(const missing of[null,undefined,'',-1,'invalid']){const tree=await renderFactura({rol:'proveedor',escrow:{comision_proveedor:missing,pago_neto_proveedor:missing},oferta:{comision_proveedor_prevista:5,pago_neto_proveedor_previsto:95}});assert.equal(bloques(tree).length,0);assert.match(texto(tree),/Neto a percibir por el profesionalNo consta/)}
 const tree=await renderFactura({escrow:{comision_cliente:null,comision_cliente_retenida:null,monto_reembolsado:100,estado:'reembolsado'}});assert.equal(bloques(tree).length,0);assert.match(texto(tree),/Desglose original no disponible/)
})
await test('Unpaid proposals explicitly label VAT as estimated; absent offer fields cannot invent a zero fee',async()=>{
 for(const rol of['cliente','proveedor']){const tree=await renderFactura({rol,pagado:false,oferta:{comision_proveedor_prevista:null,pago_neto_proveedor_previsto:100,comision_proveedor_porcentaje:null,comision_proveedor_minima:null}});importes(bloques(tree)[0],8.26,1.74,10);assert.match(texto(tree),/Desglose previsto. Este pago todavía no se ha cobrado/);assert.doesNotMatch(texto(tree),/Total pagado por el cliente/)}
})
await test('An in-flight settlement is visibly pending, not confirmed tax collection',async()=>{
 const tree=await renderFactura({rol:'proveedor',escrow:{estado:'liquidando',liquidacion_estado:'procesando',comision_proveedor:3,pago_neto_proveedor:57,monto_reembolsado:40,monto_bruto_proveedor:60}});assert.match(texto(tree),/Importe bruto previsto en la liquidación60,00/);assert.match(texto(bloques(tree)[0]),/Desglose de liquidación pendiente de confirmación/);assert.doesNotMatch(texto(bloques(tree)[0]),/pago todavía no se ha cobrado/)
 const client=await renderFactura({escrow:{estado:'liquidando',liquidacion_estado:'procesando',monto_reembolsado:40}});assert.match(texto(client),/Reembolso previsto/);assert.match(texto(client),/Coste previsto tras la liquidación/);assert.doesNotMatch(texto(client),/Reembolsado al cliente:|Coste final tras la resolución/)
})
await test('English contains all four tax rows and retains receipt/professional-invoice distinction',async()=>{
 const tree=await renderFactura({idioma:'en',rol:'proveedor'}),text=texto(tree);assert.deepEqual(filas(bloques(tree)[0]).map(x=>x[0]),['Taxable amount','VAT rate','VAT amount','Total Diime fees (including VAT)']);assert.match(text,/does not replace the tax invoices/);assert.doesNotMatch(text,/Base imponible|Cuota de IVA/)
})
await test('Minimum and awkward-cent commissions conserve every recorded gross cent',async()=>{
 for(const [fee,base,vat]of[[2,1.65,.35],[2.01,1.66,.35],[.01,.01,0],[1.25,1.03,.22],[123.45,102.02,21.43]]){const tree=await renderFactura({escrow:{comision_cliente:fee,monto:100+fee}});importes(bloques(tree)[0],base,vat,fee);const d=comisiones.desglosarIvaIncluido(fee);assert.equal(Math.round((d.baseImponible+d.cuotaIva)*100),Math.round(fee*100))}
})
await test('Array query overrides cannot cross provider financial privacy',async()=>{
 const tree=await renderFactura({rol:'proveedor',vista:['cliente','proveedor']});assert.equal(bloques(tree).length,1);assert.match(bloques(tree)[0].props['aria-label'],/proveedor/);assert.doesNotMatch(texto(tree),/Total pagado por el cliente/)
})
await test('Explicit zero client fee remains a known zero with its unchanged service total',async()=>{
 const tree=await renderFactura({escrow:{comision_cliente:0,monto:100}});importes(bloques(tree)[0],0,0,0);assert.match(texto(tree),/Total pagado por el cliente100,00/)
})
await test('Prepared but unpaid checkout keeps its recorded fee and labels it estimated',async()=>{
 const datos=datosFactura({rol:'proveedor',pagado:false});datos.escrow={monto:110,monto_base:100,comision_cliente:10,comision_proveedor:5,pago_neto_proveedor:95,estado:'pendiente',fecha_retencion:null}
 const tree=await renderFactura({datos});importes(bloques(tree)[0],4.13,.87,5);assert.match(texto(tree),/Desglose previsto/);assert.match(texto(tree),/Neto previsto para el profesional95,00/)
})
await test('Known provider fee remains available independently of an unknown settlement net',async()=>{
 const tree=await renderFactura({rol:'proveedor',escrow:{comision_proveedor:5,pago_neto_proveedor:null}});importes(bloques(tree)[0],4.13,.87,5);assert.match(texto(tree),/Neto a percibir por el profesionalNo consta/)
})
await test('Unauthorized/missing data never renders financial or fiscal information',async()=>{await assert.rejects(()=>renderFactura({datos:null}),/NOT_FOUND/)})
console.log(`${count} receipt/VAT scenarios passed using real async server components; no database or payment writes.`)
