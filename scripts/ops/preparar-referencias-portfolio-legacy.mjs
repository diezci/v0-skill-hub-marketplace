/** Reads and verifies existing copies, then writes a local transactional SQL file. Never applies it. */
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { productionAdapter } from './verificar-adjuntos-migrados.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
export const imageArrayHash = images => hash(images.map(value => `${Buffer.byteLength(value, 'utf8')}:${value}`).join('|'))
const safeError = error => /^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'PREPARATION_FAILED'
export function renderPortfolioSql(mappings) {
  if (!Array.isArray(mappings) || !mappings.length) throw Error('VERIFIED_MAPPINGS_REQUIRED')
  const json = JSON.stringify(mappings).replace(/'/g, "''")
  return `-- Prepared from verified private/public copies. Review and execute as a database operator.
-- Changes only the reviewed portfolio image arrays. All product triggers remain enabled.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $operation$
declare
 mappings jsonb:='${json}'::jsonb; m jsonb; a public.archivos_privados;
 before_row public.portfolio; after_row public.portfolio; wanted text[];
 previous_claims text:=current_setting('request.jwt.claims',true);
 previous_sub text:=current_setting('request.jwt.claim.sub',true);
 previous_role text:=current_setting('request.jwt.claim.role',true);
 actual_hash text; affected integer; completed integer:=0;
begin
 for m in select value from jsonb_array_elements(mappings) order by value->>'portfolioId' loop
  select * into strict a from public.archivos_privados where id=(m->>'privateId')::uuid for share;
  if encode(sha256(convert_to(a.legacy_url,'UTF8')),'hex') is distinct from m->>'sourceHash'
    or a.sha256 is distinct from m->>'contentHash' or a.bytes is distinct from (m->>'bytes')::bigint
    or a.propietario_id is not null or a.compartido is distinct from true then
   raise exception 'La metadata cambió desde la verificación' using errcode='55000'; end if;
  if m->>'destination' is distinct from substring(a.legacy_url from '^https://[^/]+')||'/perfiles/public/legacy-'||(m->>'sourceHash')||'.png' then
   raise exception 'El destino no corresponde a la copia revisada' using errcode='55000'; end if;
  if not exists(select 1 from diime_private.adjuntos_legacy_en_retirada where legacy_url=a.legacy_url)
    or not exists(select 1 from pg_trigger where tgrelid='public.portfolio'::regclass and tgname='diime_guard_adjuntos_legacy' and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgrelid='public.portfolio'::regclass and tgname='validar_portfolio_trabajo' and tgfoid='diime_private.validar_portfolio_trabajo()'::regprocedure and tgenabled='O') then
   raise exception 'Falta una guarda activa del portfolio' using errcode='55000'; end if;
  select * into strict before_row from public.portfolio where id=(m->>'portfolioId')::uuid for update;
  select encode(sha256(convert_to(coalesce(string_agg(octet_length(value)::text||':'||value,'|' order by ordinal),''),'UTF8')),'hex') into actual_hash
   from unnest(before_row.imagenes) with ordinality i(value,ordinal);
  if actual_hash is distinct from m->>'imagesHash' then
   raise exception 'El portfolio cambió desde la preparación; repetir lectura' using errcode='40001'; end if;
  if not a.legacy_url=any(before_row.imagenes) then
   if m->>'destination'=any(before_row.imagenes) then completed:=completed+1; continue; end if;
   raise exception 'El portfolio ya no contiene la referencia revisada' using errcode='55000'; end if;
  if before_row.profesional_id is null then raise exception 'Falta propietario' using errcode='42501'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',before_row.profesional_id::text,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',before_row.profesional_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  if auth.uid() is distinct from before_row.profesional_id then raise exception 'No coincide identidad del propietario' using errcode='42501'; end if;
  wanted:=array_replace(before_row.imagenes,a.legacy_url,m->>'destination');
  update public.portfolio set imagenes=wanted where id=before_row.id and imagenes is not distinct from before_row.imagenes;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Edición concurrente del portfolio' using errcode='40001'; end if;
  select * into strict after_row from public.portfolio where id=before_row.id;
  if after_row.imagenes is distinct from wanted or
    (to_jsonb(after_row)-array['imagenes','updated_at']) is distinct from (to_jsonb(before_row)-array['imagenes','updated_at']) then
   raise exception 'El trigger modificaría otros campos; se revierte toda la operación' using errcode='55000'; end if;
  perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  perform set_config('request.jwt.claim.role',coalesce(previous_role,''),true);
  completed:=completed+1;
 end loop;
 if completed<>jsonb_array_length(mappings) then raise exception 'Operación incompleta' using errcode='55000'; end if;
 if nullif(current_setting('request.jwt.claims',true),'') is distinct from nullif(previous_claims,'')
  or nullif(current_setting('request.jwt.claim.sub',true),'') is distinct from nullif(previous_sub,'')
  or nullif(current_setting('request.jwt.claim.role',true),'') is distinct from nullif(previous_role,'') then
  raise exception 'Claims no restaurados' using errcode='55000'; end if;
end;
$operation$;
commit;
select 'reviewed_portfolio_references_updated' as verification,${mappings.length} as reviewed_rows;
`
}
export async function preparePortfolioSql(io, { manifest, projectRef, siteUrl }) {
  if (!projectRef || !Array.isArray(manifest) || !manifest.length) throw Error('REVIEWED_MANIFEST_REQUIRED')
  const site = new URL(siteUrl)
  if (site.protocol!=='https:' || site.pathname!=='/' || site.username || site.password || site.search || site.hash) throw Error('INVALID_SITE')
  const seen = new Set()
  for (const item of manifest) {
    if (!/^[a-f0-9-]{36}$/.test(item.portfolioId||'') || !/^[a-f0-9]{64}$/.test(item.sourceHash||'') || seen.has(item.portfolioId)) throw Error('INVALID_OR_DUPLICATE_PORTFOLIO_MANIFEST')
    // One mapping per row makes the generated snapshot CAS unambiguous.
    seen.add(item.portfolioId)
  }
  await io.preflight(projectRef)
  const records=await io.listLegacyMetadata(), blobs=await io.listOwnedBlobs(), mappings=[]
  for (const item of manifest) {
    const found=records.filter(row=>hash(row.legacy_url||'')===item.sourceHash)
    if(found.length!==1)throw Error('METADATA_REQUIRED')
    const record=found[0], canonical=new URL(`/api/archivos/${record.id}`,site.origin);canonical.searchParams.set('nombre',record.nombre)
    if(record.propietario_id!==null || record.compartido!==true || record.tipo!=='image/png' || record.url!==canonical.href || !record.storage_path?.startsWith('legacy/') || !/^[a-f0-9]{64}$/.test(record.sha256||'') || !Number.isInteger(record.bytes) || record.bytes<8 || record.bytes>10485760)throw Error('VERIFIED_METADATA_REQUIRED')
    const privateBytes=await io.downloadPrivate(record.storage_path)
    if(privateBytes.length!==record.bytes || hash(privateBytes)!==record.sha256 || !privateBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('PRIVATE_PNG_MISMATCH')
    const pathname=`perfiles/public/legacy-${item.sourceHash}.png`,targets=blobs.filter(blob=>blob.pathname===pathname)
    if(targets.length!==1 || targets[0].size!==record.bytes || targets[0].url!==new URL('/'+pathname,record.legacy_url).href)throw Error('OWNED_PUBLIC_COPY_REQUIRED')
    const publicImage=await io.downloadPublic(targets[0])
    if(publicImage.status!==200 || publicImage.type!=='image/png' || !publicImage.bytes?.equals(privateBytes))throw Error('PUBLIC_PNG_MISMATCH')
    const row=await io.readPortfolio(item.portfolioId)
    if(row?.id!==item.portfolioId || !Array.isArray(row.imagenes) || row.imagenes.some(value=>typeof value!=='string') || (!row.imagenes.includes(record.legacy_url)&&!row.imagenes.includes(targets[0].url)))throw Error('PORTFOLIO_REFERENCE_CHANGED')
    mappings.push({...item,privateId:record.id,contentHash:record.sha256,bytes:record.bytes,destination:targets[0].url,imagesHash:imageArrayHash(row.imagenes)})
  }
  return {sql:renderPortfolioSql(mappings),mappings}
}
async function main(){
 const args=process.argv.slice(2),options={}
 for(let i=0;i<args.length;i++){
  if(args[i]==='--help'){console.log('Usage: node --env-file=ENV scripts/ops/preparar-referencias-portfolio-legacy.mjs --project-ref REF --manifest FILE --sql-output FILE. Read-only remote operations; creates local SQL only.');return}
  else if(args[i]==='--project-ref'&&args[i+1])options.projectRef=args[++i]
  else if(args[i]==='--manifest'&&args[i+1])options.manifestPath=args[++i]
  else if(args[i]==='--sql-output'&&args[i+1])options.sqlPath=args[++i]
  else throw Error('UNKNOWN_ARGUMENT')
 }
 if(!options.manifestPath||!options.sqlPath)throw Error('MANIFEST_AND_SQL_OUTPUT_REQUIRED')
 const fs=await import('node:fs/promises'),manifest=JSON.parse(await fs.readFile(options.manifestPath,'utf8'))
 const result=await preparePortfolioSql(await productionAdapter(process.env),{...options,manifest,siteUrl:process.env.NEXT_PUBLIC_SITE_URL})
 await fs.writeFile(options.sqlPath,result.sql,{mode:0o600});await fs.chmod(options.sqlPath,0o600)
 console.log(JSON.stringify({remoteMode:'read-only',preparedRows:result.mappings.length,sourceHashes:result.mappings.map(row=>row.sourceHash)}))
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(safeError(error));process.exitCode=1})
