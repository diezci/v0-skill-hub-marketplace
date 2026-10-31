import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(fs.readFileSync('lib/stripe-liquidacion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function fixture(disputes=[],disputed=true){const exports={},calls=[];const stripe={charges:{retrieve:async()=>({id:'ch',livemode:false,disputed})},disputes:{list:async function*(params){calls.push(params);for(const d of disputes)yield{id:'du',charge:'ch',livemode:false,status:'won',...d}}}};vm.runInNewContext(source,{exports,require:n=>n==='@/lib/stripe'?{stripe}:{},setTimeout});return{calls,run:(allowed=[])=>exports.comprobarContracargosParaLiquidacion('ch',allowed)}}
let count=0;const test=async(n,f)=>{await f();console.log('PASS '+n);count++}
await test('Undisputed charges need no dispute history request',async()=>{const f=fixture([],false);await f.run();assert.equal(f.calls.length,0)})
await test('Historic disputed flag permits a current won and locally reconciled bank case',async()=>{await fixture([{}]).run(['du'])})
await test('Winning without a completed local reconciliation remains blocked',async()=>{await assert.rejects(fixture([{}]).run())})
await test('New pending lost foreign-mode and foreign-charge proceedings remain blocked',async()=>{for(const d of [{id:'new'},{status:'lost'},{status:'needs_response'},{charge:'foreign'},{livemode:true}])await assert.rejects(fixture([{},d]).run(['du']))})
await test('Empty history cannot explain a disputed charge',async()=>{await assert.rejects(fixture([]).run(['du']))})
await test('All paginated bank cases must be won and explicitly reconciled',async()=>{await fixture([{}, {id:'du2'}]).run(['du','du2']);await assert.rejects(fixture([{}, {id:'du2'}]).run(['du']))})
console.log(count+' won-bank guards passed; no network')
