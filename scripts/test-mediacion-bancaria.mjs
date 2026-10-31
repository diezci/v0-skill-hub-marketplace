import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const source=transpile(fs.readFileSync('app/actions/mediacion-bancaria.ts','utf8'))
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',mediation='33333333-3333-4333-8333-333333333333',bank='44444444-4444-4444-8444-444444444444'
const valid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x)
function fixture(opt={}){
 const calls=[],paths=[]
 const client={auth:{getUser:async()=>({data:{user:opt.noUser?null:{id:actor}}}),getClaims:async()=>({data:{claims:{sub:opt.otherSubject?'foreign':actor,session_id:opt.noSession?null:session}},error:opt.claimError||null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{es_admin:!opt.nonAdmin,cuenta_eliminada:opt.deleted?'deleted':null},error:opt.profileError||null})})})})}
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(opt.throw)throw Error('private backend detail');return{data:{cerrada:true,nuevo_cierre:!opt.alreadyClosed},error:opt.rpcError?{message:'private backend detail'}:null}}}
 const exports={};vm.runInNewContext(source,{exports,require:name=>{
  if(name==='next/cache')return{revalidatePath:p=>paths.push(p)}
  if(name==='@/lib/supabase/server')return{createClient:async()=>client}
  if(name==='@/lib/supabase/admin')return{createAdminClient:()=>admin}
  if(name==='@/lib/notificaciones-contexto')return{idNotificacionValido:valid}
  if(name==='@/lib/i18n-servidor')return{textoServidor:async text=>text}
  throw Error('Unexpected dependency (financial calls are forbidden): '+name)
 }});return{calls,paths,run:(note='Motivo administrativo registrado',id=mediation,bid=bank)=>exports.cerrarMediacionTrasContracargo(id,bid,note)}
}
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)}
await test('Blank oversized malformed and missing identity input cannot reach the closure RPC',async()=>{for(const args of [[''],['  '],['x'.repeat(2001)],['ok','bad'],['ok',mediation,'bad'],[null]]){const f=fixture();assert.ok((await f.run(...args)).error);assert.equal(f.calls.length,0)}})
await test('Missing revoked-session subject nonadmin and deleted administrator deny before service RPC',async()=>{for(const opt of [{noUser:true},{otherSubject:true},{noSession:true},{claimError:{}},{nonAdmin:true},{deleted:true},{profileError:{}}]){const f=fixture(opt);assert.ok((await f.run()).error);assert.equal(f.calls.length,0)}})
await test('Authenticated administrator binds both proceedings current session and mandatory reason',async()=>{const f=fixture();assert.equal((await f.run('  Motivo auditable  ')).success,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'diime_cerrar_mediacion_tras_contracargo');assert.equal(JSON.stringify(f.calls[0].args),JSON.stringify({p_disputa:mediation,p_contracargo:bank,p_actor:actor,p_sesion:session,p_motivo:'Motivo auditable'}));assert.equal(f.paths.length,4)})
await test('SQL refusal after authorization is surfaced safely without invalidating the UI as successful',async()=>{for(const opt of [{rpcError:true},{throw:true}]){const f=fixture(opt),r=await f.run();assert.ok(r.error&&!r.error.includes('private'));assert.equal(f.calls.length,1);assert.equal(f.paths.length,0)}})
await test('An idempotent SQL closure is accepted without a second command or monetary dependency',async()=>{const f=fixture({alreadyClosed:true});assert.equal((await f.run()).success,true);assert.equal(f.calls.length,1)})
const uiSource=fs.readFileSync('components/mis-disputas.tsx','utf8'),ast=ts.createSourceFile('view.tsx',uiSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const declarations=ast.statements.filter(x=>ts.isFunctionDeclaration(x)&&['configResuelta','textoResolucion'].includes(x.name?.text)).map(x=>x.getText(ast)).join('\n')+'\nexports.config=configResuelta;exports.text=textoResolucion;'
const exports={};vm.runInNewContext(transpile(declarations),{exports,CheckCircle2:'neutralIcon',XCircle:'lostIcon'})
await test('Both parties see the same neutral bank closure rather than a winner loss or partial award',async()=>{const a=exports.config('cierre_bancario',true),b=exports.config('cierre_bancario',false);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(a.label,'Mediación cerrada tras conciliación bancaria');assert.ok(!/(emerald|red|amber)/.test(a.cls));assert.equal(exports.text('cierre_bancario',true),exports.text('cierre_bancario',false));assert.match(exports.text('cierre_bancario',true),/sin movimientos adicionales/);assert.notEqual(a.label,exports.config('cliente',true).label);assert.notEqual(a.label,exports.config('parcial',true).label)})
console.log(count+' administrative bank-mediation tests passed; no network, no SQL migration, no money')
