import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyMigratedAttachments, productionAdapter, parseOptions } from './ops/verificar-adjuntos-migrados.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
const original = 'https://fixture.public.blob.vercel-storage.com/old.png'
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from('verified synthetic png')])
const portfolioId = '00000000-0000-4000-8000-000000000001'
const privateId = '00000000-0000-4000-8000-000000000002'
const sourceHash = hash(original)
const pathname = `perfiles/public/legacy-${sourceHash}.png`
const target = 'https://fixture.public.blob.vercel-storage.com/' + pathname
const options = { projectRef: 'fixture', siteUrl: 'https://diime.test', expectedLegacyCount: 1, manifest: [{ portfolioId, sourceHash }] }
function fixture() {
  const record = { id: privateId, legacy_url: original, propietario_id: null, compartido: true, storage_path: 'legacy/file.png', nombre: 'old.png', url: `https://diime.test/api/archivos/${privateId}?nombre=old.png`, tipo: 'image/png', bytes: png.length, sha256: hash(png) }
  const state = { records: [record], blobs: [{ url: target, pathname, size: png.length }], privateBytes: png, publicBytes: png, originalStatus: 404, publicStatus: 200, images: [target], calls: [] }
  const io = {
    preflight: async () => {}, listLegacyMetadata: async () => state.records, listOwnedBlobs: async () => state.blobs,
    downloadPrivate: async () => { state.calls.push('downloadPrivate'); return state.privateBytes },
    probeOriginal: async url => { state.calls.push('probeOriginal'); assert.equal(url, original); return state.originalStatus },
    readPortfolio: async id => { state.calls.push('readPortfolio'); assert.equal(id,portfolioId); return { id, imagenes: state.images } },
    downloadPublic: async blob => { state.calls.push('downloadPublic'); assert.equal(blob.url,target); return { status: state.publicStatus, type: 'image/png', bytes: state.publicBytes } },
  }
  return { state, io, run: opts => verifyMigratedAttachments(io,{...options,...opts}) }
}
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name) }
await check('complete proof requires checksum, inventory absence, original404 and new public200',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'passed_file_verification');assert.equal(r.counts.verifiedLegacyFiles,1);assert.equal(r.counts.verifiedPublicImages,1)
 assert.equal(r.parentReferences.status,'not_checked_by_this_script');assert.ok(!JSON.stringify(r).includes(original));assert.ok(!JSON.stringify(r).includes(target))
 assert.deepEqual(f.state.calls,['downloadPrivate','probeOriginal','readPortfolio','downloadPublic'])
})
await check('original200 fails even when inventory is absent',async()=>{const f=fixture();f.state.originalStatus=200;const r=await f.run();assert.equal(r.status,'failed');assert.ok(r.entries[0].errors.includes('ORIGINAL_HTTP_NOT_404'));assert.equal(r.counts.originalsAbsentFromInventory,1)})
await check('inventory presence fails even when HTTP returns404',async()=>{const f=fixture();f.state.blobs.push({url:original,size:png.length});const r=await f.run();assert.equal(r.status,'failed');assert.ok(r.entries[0].errors.includes('ORIGINAL_STILL_IN_BLOB_INVENTORY'))})
await check('HTTP403,410 and500 are not treated as deletion proof',async()=>{for(const status of [403,410,500]){const f=fixture();f.state.originalStatus=status;assert.equal((await f.run()).status,'failed')}})
await check('private corruption fails and public verification cannot hide it',async()=>{const f=fixture();f.state.privateBytes=Buffer.from('bad');const r=await f.run();assert.equal(r.counts.verifiedPrivateCopies,0);assert.equal(r.counts.verifiedPublicImages,0);assert.equal(r.counts.originalsHttp404,1)})
await check('public image content corruption and HTTP errors fail',async()=>{const f=fixture();f.state.publicBytes=Buffer.from('bad');assert.equal((await f.run()).portfolios[0].errors[0],'CONTENT_MISMATCH');const g=fixture();g.state.publicStatus=404;assert.equal((await g.run()).portfolios[0].errors[0],'PUBLIC_PNG_HTTP_NOT_200')})
await check('new public file must be in owned inventory and referenced by exact reviewed row',async()=>{const f=fixture();f.state.images=[original];assert.equal((await f.run()).portfolios[0].errors[0],'PORTFOLIO_REFERENCES_NOT_REPOINTED');const g=fixture();g.state.blobs[0].pathname='other.png';assert.equal((await g.run()).portfolios[0].errors[0],'PUBLIC_COPY_NOT_IN_OWNED_INVENTORY')})
await check('wrong store prevents original HTTP probe',async()=>{const f=fixture();f.state.blobs=[];const r=await f.run();assert.ok(r.entries[0].errors.includes('ORIGINAL_STORE_NOT_PROVEN'));assert.ok(!f.state.calls.includes('probeOriginal'))})
await check('invalid metadata rejects arbitrary HTTP and private downloads',async()=>{const f=fixture();f.state.records[0].legacy_url='http://127.0.0.1/secrets';const r=await f.run();assert.equal(r.entries[0].errors[0],'INVALID_LEGACY_METADATA');assert.deepEqual(f.state.calls,[])})
await check('expected count mismatch, empty metadata and duplicates cannot certify completion',async()=>{const f=fixture();assert.ok((await f.run({expectedLegacyCount:19})).errors.includes('LEGACY_COUNT_MISMATCH'));f.state.records=[];assert.ok((await f.run()).errors.includes('NO_LEGACY_METADATA'));const g=fixture();g.state.records.push(g.state.records[0]);assert.ok((await g.run()).errors.includes('DUPLICATE_METADATA'))})
await check('transport errors containing credentials or raw URLs are redacted',async()=>{const f=fixture();f.io.probeOriginal=async()=>{throw Error('secret https://fixture/secrets')};const r=await f.run();assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(r.entries[0].errors.includes('READ_VERIFICATION_FAILED'))})
await check('invalid manifest, apply flag and expected count rejected',async()=>{const f=fixture();await assert.rejects(f.run({manifest:[]}),/PORTFOLIO_MANIFEST_REQUIRED/);await assert.rejects(f.run({expectedLegacyCount:0}),/INVALID_EXPECTED_COUNT/);assert.throws(()=>parseOptions(['--apply']),/UNKNOWN_ARGUMENT/);assert.deepEqual(parseOptions(['--help']),{help:true})})

function adapterFixture({ maxRows = 2 } = {}) {
 const f=fixture();const state={requests:[],queries:[],cursors:[],records:f.state.records,blobs:f.state.blobs,publicBucket:false}
 const db={storage:{getBucket:async()=>({data:{id:'adjuntos-privados',public:state.publicBucket}}),from:()=>({download:async()=>({data:new Blob([png])})})},from(table){
  assert.equal(table,'archivos_privados');const q={cursor:null,select(){return this},not(){return this},order(){return this},range(){return this},gt(key,id){assert.equal(key,'id');this.cursor=id;return this},then(resolve,reject){state.queries.push(this.cursor);const rows=state.records.filter(row=>!this.cursor||row.id>this.cursor);return Promise.resolve({data:rows.slice(0,maxRows),count:rows.length,error:null}).then(resolve,reject)}};return q
 }}
 const deps={supabase:{createClient:()=>db},blob:{list:async({cursor})=>{state.cursors.push(cursor);return cursor?{blobs:[],hasMore:false}:{blobs:state.blobs,hasMore:true,cursor:'page2'}}},fetch:async(url,opts)=>{state.requests.push({url,opts});if(url===original)return new Response('missing',{status:404});assert.equal(url,target);return new Response(png,{status:200,headers:{'content-type':'image/png'}})}}
 return{state,io:()=>productionAdapter({NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',BLOB_READ_WRITE_TOKEN:'synthetic'},deps)}
}
await check('actual read-only adapter paginates metadata by key and Blob by cursor',async()=>{const f=adapterFixture();f.state.records=Array.from({length:5},(_,i)=>({...f.state.records[0],id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}));const io=await f.io();await io.preflight('fixture');assert.equal((await io.listLegacyMetadata()).length,5);assert.deepEqual(f.state.queries,[null,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000004']);await io.listOwnedBlobs();assert.deepEqual(f.state.cursors,[undefined,'page2']);assert.ok(!('putPublic'in io));assert.ok(!('deleteOwnedBlob'in io));assert.ok(!('replaceReferences'in io))})
await check('actual adapter original probe needs known metadata and owned origin; never follows redirects',async()=>{const f=adapterFixture(),io=await f.io();await assert.rejects(io.probeOriginal(original),/UNTRUSTED_ORIGINAL_PROBE/);await io.listLegacyMetadata();await io.listOwnedBlobs();assert.equal(await io.probeOriginal(original),404);await assert.rejects(io.probeOriginal('http://127.0.0.1'),/UNTRUSTED_ORIGINAL_PROBE/);assert.equal(f.state.requests[0].opts.redirect,'error');assert.equal(f.state.requests[0].opts.cache,'no-store');assert.equal(f.state.requests[0].opts.headers.Authorization,undefined)})
await check('actual adapter verifies owned public200 and private bytes; rejects wrong project/public bucket',async()=>{const f=adapterFixture(),io=await f.io();await assert.rejects(io.preflight('wrong'),/PROJECT_MISMATCH/);f.state.publicBucket=true;await assert.rejects(io.preflight('fixture'),/PRIVATE_BUCKET_REQUIRED/);await io.listOwnedBlobs();assert.deepEqual((await io.downloadPublic(f.state.blobs[0])).bytes,png);assert.deepEqual(await io.downloadPrivate('legacy/file.png'),png);await assert.rejects(io.downloadPublic({url:'https://unowned.public.blob.vercel-storage.com/x'}),/UNTRUSTED_PUBLIC_IMAGE/)})
console.log(JSON.stringify({passed,failed:0,network:false,remoteMutations:false}))
