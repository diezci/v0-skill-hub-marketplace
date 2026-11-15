// PostgreSQL tests for the common professional portfolio. Deliberately no
// company tables, membership, workspace or Stripe schema in this fixture.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : '@electric-sql/pglite')
const db = new PGlite()
const read = path => readFile(new URL(path, import.meta.url), 'utf8')
let assertions = 0
const check = (condition, message) => { assert.ok(condition, message); assertions++ }
const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0]
const rpc = async (name,args=[]) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).value
const asRole = async (role='postgres',actor=null) => {
 await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor||''])
 if (role!=='postgres') await db.exec(`set role ${role}`)
}
const expectError = async (fn,pattern,message) => {
 try { await fn() } catch(error) { assert.match(error.message,pattern,message); assertions++; return }
 assert.fail(message)
}
try {
 await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema diime_private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth,public,diime_private to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  create table public.profiles(id uuid primary key,nombre text not null,apellido text,es_admin boolean not null default false,verificado boolean not null default true,cuenta_eliminada timestamptz);
  create table public.trabajos(id uuid primary key,profesional_id uuid not null,estado text not null);
  create table public.portfolio(id uuid primary key default gen_random_uuid(),profesional_id uuid not null references public.profiles,
   trabajo_id uuid references public.trabajos on delete set null,titulo text not null,descripcion text,categoria text,imagenes text[],
   ubicacion text,duracion text,presupuesto numeric(10,2),fecha_proyecto date,visible boolean default true not null,
   created_at timestamptz default now(),contexto_proveedor text);
  grant insert,update,delete on public.portfolio to authenticated;
  create policy portfolio_owner_insert on public.portfolio for insert to authenticated with check(profesional_id=auth.uid());
  create policy portfolio_owner_update on public.portfolio for update to authenticated using(profesional_id=auth.uid()) with check(profesional_id=auth.uid());
  create policy portfolio_owner_delete on public.portfolio for delete to authenticated using(profesional_id=auth.uid());
 `)
 const ids={individual:'85000000-0000-4000-8000-000000000001',business:'85000000-0000-4000-8000-000000000002',admin:'85000000-0000-4000-8000-000000000003',other:'85000000-0000-4000-8000-000000000004'}
 for(const [name,id] of Object.entries(ids)) await db.query('insert into profiles(id,nombre,apellido,es_admin) values($1,$2,$3,$4)',[id,name==='business'?'Empresa Ejemplo SL':name,name==='business'?null:'Prueba',name==='admin'])
 const work='86000000-0000-4000-8000-000000000001'
 const pendingWork='86000000-0000-4000-8000-000000000002'
 await db.query("insert into trabajos values($1,$2,'completado'),($3,$2,'pendiente')",[work,ids.individual,pendingWork])
 const legacy=(await one("insert into portfolio(profesional_id,titulo,descripcion,presupuesto) values($1,'Externo antiguo','No revisado',1234.56) returning id",[ids.individual])).id
 const linked=(await one("insert into portfolio(profesional_id,trabajo_id,titulo,descripcion) values($1,$2,'Realizado en Diime','Contrato completado') returning id",[ids.individual,work])).id
 await db.exec(await read('../migrations/044_portfolio_publico.sql'))
 await db.exec(await read('../migrations/20261115155239_portfolio_perfil_acreditado.sql'))
 const publicPortfolio = async (id=ids.individual)=>(await db.query('select * from public.portfolio_publico($1)',[id])).rows
 const ownPortfolio = async ()=>(await db.query('select * from public.mi_portfolio()')).rows
 await asRole('anon')
 check((await publicPortfolio()).some(p=>p.id===linked),'Contrato completado se publica sin acreditación manual')
 check(!(await publicPortfolio()).some(p=>p.id===legacy),'Proyecto externo heredado queda privado hasta revisión')
 await expectError(()=>db.query('select evidencia_acreditacion from public.portfolio'),/permission denied/,'Anon no lee evidencia por Data API')
 await expectError(()=>db.query('select presupuesto from public.portfolio'),/permission denied/,'Presupuesto exacto permanece privado')
 const proof='Factura ref-2026-114 y fotografías propias disponibles para contrastar el trabajo.'
 for(const provider of [ids.individual,ids.business]) {
  await asRole('authenticated',provider)
  const item=(await one('insert into portfolio(profesional_id,titulo,descripcion,evidencia_acreditacion,presupuesto) values($1,$2,$3,$4,9876.54) returning id',[provider,'Proyecto documentado','Trabajo realizado y pendiente de acreditar',proof])).id
  check((await ownPortfolio()).find(p=>p.id===item)?.evidencia_acreditacion===proof,'El mismo perfil recupera su evidencia, sea particular o empresa')
  check((await rpc('mis_acreditaciones_portfolio')).find(p=>p.id===item)?.acreditacion==='pendiente','Alta común queda pendiente')
  await expectError(()=>rpc('portfolio_acreditaciones_listar'),/Solo el equipo/,'Proveedor no accede a revisión administrativa')
  await expectError(()=>db.query("update diime_private.portfolio_acreditaciones set estado='acreditado' where item_id=$1",[item]),/permission denied/,'Proveedor no se acredita directamente')
  await asRole('authenticated',ids.other)
  check(!(await rpc('mis_acreditaciones_portfolio')).some(p=>p.id===item),'Sesión ajena no obtiene estados/notas privadas')
  check(!(await db.query('select id from portfolio where id=$1',[item])).rows.length,'Data API no filtra un proyecto pendiente a otros usuarios')
  await asRole('authenticated',ids.admin)
  let entry=(await rpc('portfolio_acreditaciones_listar')).find(p=>p.item_id===item)
  check(entry?.evidencia_acreditacion===proof && !Object.hasOwn(entry,'presupuesto'),'Administrador recibe evidencia sin presupuesto privado')
  const review=(revision=entry.revision_id,decision='acreditado',nota='Evidencias y participación contrastadas por Diime')=>rpc('portfolio_acreditacion_revisar',[item,revision,decision,nota])
  await expectError(()=>review(entry.revision_id,null),/decisión/,'Decisión nula rechazada explícitamente')
  await expectError(()=>review(entry.revision_id,'acreditado','ok'),/motivo/,'La revisión requiere motivo sustantivo')
  await review()
  await asRole('anon')
  const published=(await publicPortfolio(provider)).find(p=>p.id===item)
  check(published?.titulo==='Proyecto documentado','Revisión publica el mismo portfolio para cualquier proveedor')
  check(!Object.hasOwn(published,'evidencia_acreditacion') && !Object.hasOwn(published,'presupuesto'),'Proyección pública no incluye evidencia ni importe exacto')
  check((await db.query('select id from portfolio where id=$1',[item])).rows.length===1,'Acceso directo solo permite el proyecto ya acreditado')
  await asRole();await db.query('update profiles set verificado=false where id=$1',[provider])
  await asRole('anon')
  check(!(await publicPortfolio(provider)).length,'RPC público oculta portfolio completo si la acreditación del proveedor se retira')
  check(!(await db.query('select id from portfolio where id=$1',[item])).rows.length,'RLS también oculta un proyecto acreditado de un proveedor no acreditado')
  await asRole('authenticated',provider)
  check((await ownPortfolio()).some(p=>p.id===item),'Titular conserva acceso privado a proyectos al perder acreditación')
  await asRole();await db.query('update profiles set verificado=true where id=$1',[provider])
  await asRole('authenticated',provider)
  await db.query('update portfolio set visible=false where id=$1',[item])
  check((await rpc('mis_acreditaciones_portfolio')).find(p=>p.id===item).acreditacion==='acreditado','Ocultar voluntariamente no borra una revisión válida')
  await asRole('anon');check(!(await publicPortfolio(provider)).some(p=>p.id===item),'Proyecto ocultado no se publica aunque esté acreditado')
  await asRole('authenticated',provider)
  await db.query("update portfolio set visible=true,descripcion='Contenido nuevo' where id=$1",[item])
  check((await rpc('mis_acreditaciones_portfolio')).find(p=>p.id===item).acreditacion==='pendiente','Editar contenido invalida acreditación')
  await asRole('authenticated',ids.admin)
  await expectError(()=>review(),/ha cambiado/,'Expediente obsoleto no aprueba el contenido nuevo')
  entry=(await rpc('portfolio_acreditaciones_listar')).find(p=>p.item_id===item)
  await review(entry.revision_id,'requiere_informacion','Falta documento con la referencia indicada')
  await asRole('authenticated',provider)
  check((await rpc('mis_acreditaciones_portfolio')).find(p=>p.id===item).nota_acreditacion.includes('Falta documento'),'Proveedor recibe indicaciones de Diime')
  await asRole('anon');check(!(await publicPortfolio(provider)).some(p=>p.id===item),'Información insuficiente permanece privada')
  await asRole('authenticated',provider);await db.query('delete from portfolio where id=$1',[item])
  await asRole();check(!(await db.query('select item_id from diime_private.portfolio_acreditaciones where item_id=$1',[item])).rows.length,'Eliminar limpia la revisión activa')
  check((await one('select count(*)::int n from diime_private.portfolio_acreditaciones_historial where item_id=$1',[item])).n===2,'Historial de decisiones se conserva tras eliminar proyecto')
 }
 await asRole('authenticated',ids.admin)
 const own=(await one("insert into portfolio(profesional_id,titulo,descripcion,evidencia_acreditacion) values($1,'Propio','Descripción',$2) returning id",[ids.admin,proof])).id
 const ownEntry=(await rpc('portfolio_acreditaciones_listar')).find(p=>p.item_id===own)
 await expectError(()=>rpc('portfolio_acreditacion_revisar',[own,ownEntry.revision_id,'acreditado','Yo mismo reviso mi propio trabajo']),/propios proyectos/,'Un admin no acredita su propio portfolio')
 const oldEntry=(await rpc('portfolio_acreditaciones_listar')).find(p=>p.item_id===legacy)
 await expectError(()=>rpc('portfolio_acreditacion_revisar',[legacy,oldEntry.revision_id,'acreditado','Revisión sin evidencia suficiente']),/Faltan referencias/,'Registros antiguos sin evidencia no se acreditan por accidente')
 await asRole()
 await db.query("update trabajos set estado='pendiente' where id=$1",[work])
 await asRole('anon');check(!(await publicPortfolio()).some(p=>p.id===linked),'Contrato que deja de estar completado deja de publicarse')
 await asRole('authenticated',ids.business)
 const forged=(await one("insert into portfolio(profesional_id,trabajo_id,titulo) values($1,$2,'Vínculo ajeno') returning id",[ids.business,work])).id
 await asRole();await db.query("update trabajos set estado='completado' where id=$1",[work])
 await asRole('anon');check(!(await publicPortfolio(ids.business)).some(p=>p.id===forged),'Ni un ID válido ajeno concede publicación')
 for(const role of ['anon','service_role']) {
  await asRole(role)
  for(const fn of ['mis_acreditaciones_portfolio','portfolio_acreditaciones_listar']) await expectError(()=>rpc(fn),/permission denied/,'RPC privado restringido a sesiones autorizadas')
 }
 await asRole('authenticated',ids.admin)
 await asRole();await db.query('update profiles set cuenta_eliminada=now() where id=$1',[ids.admin])
 await asRole('authenticated',ids.admin);await expectError(()=>rpc('portfolio_acreditaciones_listar'),/Solo el equipo/,'Admin con cuenta cerrada pierde la revisión')
 await asRole()
 check((await one("select to_regclass('public.empresas') is null and to_regclass('diime_private.empresa_portfolio') is null as independiente")).independiente,'Flujo funciona sin espacio ni tablas de empresa')
 for(const table of ['portfolio_acreditaciones','portfolio_acreditaciones_historial']) check((await one('select relrowsecurity from pg_class where oid=$1::regclass',[`diime_private.${table}`])).relrowsecurity,'Evidencia administrativa protegida con RLS')
 console.log(`OK ${assertions} comprobaciones PostgreSQL: portfolio común, privacidad, revisión y ausencia de dependencias empresariales.`)
} finally { await db.close() }
