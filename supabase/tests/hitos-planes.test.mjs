import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db, ids } from './fixtures/hitos-db.mjs'
let checks = 0
const one = async (q, args=[]) => (await db.query(q,args)).rows[0]
const rpc = async (name,args=[]) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).value
const role = async (r, actor=null) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('diime.actor_usuario_id','',false)",[actor||'']); if(r!=='postgres') await db.exec(`set role ${r}`) }
const check = (value,message) => {assert.ok(value,message);checks++}
const error = async(fn,pattern,message) => {await assert.rejects(fn,pattern,message);checks++}
const stage = (title, cents) => ({id:randomUUID(),titulo:title,descripcion:'',criterio_aceptacion:'Entregable revisado',fecha_limite:'2027-03-20',importe_centimos:cents})
await role('authenticated',ids.client)
const request=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion,modalidad_pago,hitos_sugeridos) values($1,'Trabajo por hitos','Servicio largo','Madrid','hitos',$2) returning id",[ids.client,JSON.stringify([{...stage('Fase sugerida',0),fecha_limite:'',criterio_aceptacion:''}])])).id
await error(()=>db.query("update public.solicitudes set hitos_sugeridos=$1 where id=$2",[JSON.stringify([stage('X',1),{...stage('Y',1),id:'invalid'}]),request]),/Identificador/,'Invalid draft IDs rejected')
await role('authenticated',ids.owner)
let plan=[stage('Diseño',3000),stage('Desarrollo',4000),stage('Entrega',3000)]
const offer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,4,'Presupuesto','hitos',$3,10,2,10,90) returning id",[request,ids.owner,JSON.stringify(plan)])).id
let state=await rpc('obtener_plan_oferta',[offer])
check(state.plan_version===1 && state.plan_aceptado_proveedor && !state.plan_aceptado_cliente,'Initial offer carries provider consent only')
await error(()=>db.query('update public.ofertas set plan_aceptado_cliente=true where id=$1',[offer]),/ambas partes/,'Provider cannot forge client consent through table update')
await error(()=>db.query('update public.ofertas set precio=200 where id=$1',[offer]),/suma/,'Existing offer editor cannot break sum')
await role('authenticated',ids.outsider)
await error(()=>rpc('obtener_plan_oferta',[offer]),/permiso/,'Outsider cannot read private plan')
await role('authenticated',ids.client)
await error(()=>rpc('aceptar_oferta_y_crear_trabajo',[offer,request,ids.owner,null]),/última versión/,'Old acceptance path cannot contract unseen milestones')
plan=[plan[0],stage('Instalación',2500),stage('Pruebas',1500),plan[2]]
state=await rpc('proponer_plan_oferta',[offer,'hitos',JSON.stringify(plan),1])
check(state.plan_version===2 && state.plan_hitos.length===4 && state.plan_aceptado_cliente && !state.plan_aceptado_proveedor,'Client adds/removes milestones and resets counterpart consent')
await error(()=>rpc('aceptar_oferta_y_crear_trabajo',[offer,request,ids.owner,null,2]),/proveedor debe aceptar/,'Client cannot contract own unaccepted counterproposal')
await error(()=>rpc('responder_plan_oferta',[offer,2,true]),/otra parte/,'Same side cannot self-accept')
await role('authenticated',ids.owner)
await error(()=>rpc('responder_plan_oferta',[offer,1,true]),/ha cambiado/,'Stale acceptance rejected')
await rpc('responder_plan_oferta',[offer,2,true])
await role('authenticated',ids.client)
const contract=await rpc('aceptar_oferta_y_crear_trabajo',[offer,request,ids.owner,null,2])
const job=contract.trabajo.id
check(contract.trabajo.modalidad_pago==='hitos','Accepted contract snapshots payment mode')
const document=await rpc('documento_contratacion',[job])
check(document.trabajo.modalidad_pago==='hitos' && document.trabajo.plan_version===2 && document.trabajo.estado==='pendiente_pago','Actual contract-document RPC includes milestone mode, version and state')
state=await rpc('obtener_plan_hitos',[job])
check(state.hitos.length===4 && state.hitos.reduce((a,h)=>a+h.comision_cliente_centimos,0)===1000,'Contract fee is allocated once in cents')
check(!JSON.stringify(state).includes('comision_proveedor_centimos'),'Client snapshot hides provider fee')
await role('authenticated',ids.owner)
state=await rpc('obtener_plan_hitos',[job])
check(!JSON.stringify(state).includes('comision_cliente_centimos'),'Provider snapshot hides client fee')
await error(()=>db.query('select * from public.trabajos_hitos'),/permission denied/,'Tables cannot leak other party fees')
await error(()=>db.query("update public.trabajos_hitos set importe_centimos=1 where trabajo_id=$1",[job]),/permission denied/,'Direct contract milestone mutation denied')
const alternative=[plan[0],stage('Nuevo alcance',4000),plan[3]]
state=await rpc('proponer_plan_trabajo',[job,'hitos',JSON.stringify(alternative),2])
check(state.propuesta.version===3 && state.hitos.length===4,'Pending changes leave effective plan unchanged')
await role('authenticated',ids.client)
await rpc('responder_plan_trabajo',[job,3,false])
state=await rpc('obtener_plan_hitos',[job])
check(!state.propuesta && state.hitos.length===4 && state.plan_version===2,'Rejecting preserves effective plan')
await role('authenticated',ids.owner)
state=await rpc('proponer_plan_trabajo',[job,'hitos',JSON.stringify(alternative),2])
check(state.propuesta.version===4,'Rejected versions are never reused')
await role('authenticated',ids.client)
await rpc('responder_plan_trabajo',[job,4,true])
state=await rpc('obtener_plan_hitos',[job])
check(state.hitos.length===3 && state.plan_version===4,'Both parties accepted added/deleted milestones')
await role('postgres')
await db.query("update public.trabajos set proveedor_stripe_account_id='acct_owner' where id=$1",[job])
await role('service_role')
await error(()=>rpc('preparar_pago_hito',[job,alternative[1].id,ids.client]),/anterior/,'Cannot fund future stage')
let escrow=await rpc('preparar_pago_hito',[job,alternative[0].id,ids.client])
check(escrow.actor_pago_id===ids.client && Number(escrow.monto)===33,'Funding snapshots actor and assigned fee')
check((await rpc('preparar_pago_hito',[job,alternative[0].id,ids.client])).id===escrow.id,'Repeated preparation returns same escrow')
await role('authenticated',ids.owner)
await error(()=>rpc('proponer_plan_trabajo',[job,'hitos',JSON.stringify(alternative),4]),/pago pendiente/,'Outstanding Checkout blocks plan mutation')
await error(()=>rpc('entregar_hito',[job,alternative[0].id,'Entrega',[]]),/pagado/,'Unpaid milestone cannot be delivered')
await role('postgres')
await db.query("update public.transacciones_escrow set estado='fondos_retenidos',fecha_retencion=now(),stripe_payment_intent_id='pi_test' where id=$1",[escrow.id])
await db.query("update public.trabajos_hitos set estado='financiado' where id=$1",[alternative[0].id])
await db.query("update public.trabajos set estado='en_progreso' where id=$1",[job])
await error(()=>db.query('update public.trabajos_hitos set titulo=$1 where id=$2',['Alterado',alternative[0].id]),/inmutables/,'Paid terms cannot change even through a privileged accidental write')
await role('authenticated',ids.client)
await error(()=>rpc('proponer_plan_trabajo',[job,'hitos',JSON.stringify([{...alternative[0],titulo:'Cambiado'},...alternative.slice(1)]),4]),/no se pueden modificar/,'Funded criteria cannot be rewritten')
const next=[alternative[0],stage('Fase A',2000),stage('Fase B',2000),alternative[2]]
state=await rpc('proponer_plan_trabajo',[job,'hitos',JSON.stringify(next),4])
await role('authenticated',ids.owner)
await rpc('responder_plan_trabajo',[job,state.propuesta.version,true])
state=await rpc('obtener_plan_hitos',[job])
check(state.hitos[0].importe_centimos===3000 && state.hitos[0].comision_proveedor_centimos===300,'Funded economics stay immutable while future stages change')
check(state.hitos.reduce((a,h)=>a+h.comision_proveedor_centimos,0)===1000,'Remaining fee allocation preserves original contract fee')
await error(()=>rpc('entregar_hito',[job,alternative[0].id,'Entrega',['https://example.test/stolen.pdf']]),/archivo|adjunto/i,'Unowned evidence rejected')
state=await rpc('entregar_hito',[job,alternative[0].id,'Entrega con evidencia textual',[]])
check(state.hitos[0].estado==='entregado','Provider submits specific funded stage')
await role('authenticated',ids.client)
state=await rpc('rechazar_entrega_hito',[job,alternative[0].id,'Falta revisar sección dos',[]])
check(state.hitos[0].estado==='cambios_solicitados','Client can request corrections without moving money')
await role('postgres')
await error(()=>db.query("update public.trabajos set estado='completado' where id=$1",[job]),/Faltan hitos/,'Even privileged legacy completion cannot close unfinished plan')
await error(()=>db.query("update public.trabajos set estado='entregado' where id=$1",[job]),/hito a hito/,'Legacy whole-job delivery cannot bypass milestones')
// One-time offers still accept through the old four-argument contract path.
await role('authenticated',ids.client)
const requestSingle=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Único','Servicio breve','Madrid') returning id",[ids.client])).id
await role('authenticated',ids.owner)
const offerSingle=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,50,2,'Oferta única',10,2,5,45) returning id",[requestSingle,ids.owner])).id
await role('authenticated',ids.client)
const single=await rpc('aceptar_oferta_y_crear_trabajo',[offerSingle,requestSingle,ids.owner,null])
check(single.trabajo.modalidad_pago==='unico','Legacy single-payment acceptance preserved')
// Reusing a rejected offer never resets the version and cannot match a stale acceptance.
await role('authenticated',ids.client)
const reusedRequest=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Reutilizar','Prueba','Madrid') returning id",[ids.client])).id
await role('authenticated',ids.owner)
const reusedPlan=[stage('Inicio',5000),stage('Final',5000)]
const reusedOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,3,'Propuesta','hitos',$3,10,2,10,90) returning id",[reusedRequest,ids.owner,JSON.stringify(reusedPlan)])).id
await role('authenticated',ids.client)
await db.query("update public.ofertas set estado='rechazada' where id=$1",[reusedOffer])
await role('authenticated',ids.owner)
await db.query("update public.ofertas set estado='pendiente',plan_hitos=$1 where id=$2",[JSON.stringify([stage('Inicio nuevo',4000),stage('Final nuevo',6000)]),reusedOffer])
check((await rpc('obtener_plan_oferta',[reusedOffer])).plan_version===2,'A reused offer receives a monotonically increasing version')
await role('authenticated',ids.client)
await error(()=>rpc('aceptar_oferta_y_crear_trabajo',[reusedOffer,reusedRequest,ids.owner,null,1]),/última versión/,'A stale initial offer cannot accept a reused ID with new terms')
// A company operator can manage deliveries without inheriting financial access.
await role('postgres')
const company=(await one("insert into public.empresas(nombre,cif,propietario_id,verificada,estado_verificacion,razon_social) values('Cliente Empresa','B12345678',$1,true,'verificada','Cliente Empresa SL') returning id",[ids.client])).id
await db.query("insert into public.empresa_miembros(empresa_id,usuario_id,cargo,origen,rol,permisos) values($1,$2,'Gestor','invitacion','miembro',$3)",[company,ids.worker2,JSON.stringify({perfil:false,mensajes:true,presupuestos:false,encargos:true,equipo:false,ver_cobros:false,gestionar_cobros:false})])
await role('authenticated',ids.client)
const companyRequest=(await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Encargo empresarial','Prueba','Madrid') returning id",[ids.client,company])).id
await role('authenticated',ids.owner)
const companyPlan=[stage('Preparación',5000),stage('Finalización',5000)]
const companyOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,4,'Presupuesto empresarial','hitos',$3,10,2,10,90) returning id",[companyRequest,ids.owner,JSON.stringify(companyPlan)])).id
await role('authenticated',ids.client)
const companyJob=(await rpc('aceptar_oferta_y_crear_trabajo',[companyOffer,companyRequest,ids.owner,null,1])).trabajo.id
const workspace=await rpc('empresa_workspace')
check(workspace.operaciones.ofertas.find(o=>o.id===companyOffer).modalidad_pago==='hitos','Latest company workspace preserves offer payment mode')
check(workspace.operaciones.trabajos.find(t=>t.id===companyJob).plan_version===1,'Latest company workspace preserves contract plan version')
check(Object.hasOwn(workspace.empresa,'domicilio') && Object.hasOwn(workspace.empresa,'foto_portada') && Object.hasOwn(workspace.operaciones.trabajos.find(t=>t.id===companyJob),'archivos_entrega'),'Latest November workspace additions survive milestone projection patch')
await role('postgres')
await db.query('update public.trabajos set operador_cliente_id=$1 where id=$2',[ids.worker2,companyJob])
await role('authenticated',ids.worker2)
const operationalView=await rpc('obtener_plan_hitos',[companyJob])
check(!JSON.stringify(operationalView).includes('comision_cliente_centimos')&&!JSON.stringify(operationalView).includes('comision_proveedor_centimos'),'Company operator without billing permission sees no fees')
check(operationalView.puede_editar && !operationalView.puede_pagar && !operationalView.puede_aprobar,'Operational and billing permissions stay separate')
await role('service_role')
await error(()=>rpc('preparar_pago_hito',[companyJob,companyPlan[0].id,ids.worker2]),/permiso.*cobros/,'Server RPC rechecks company billing rights')
await role('postgres')
await db.query("update public.empresa_miembros set estado='revocado' where empresa_id=$1 and usuario_id=$2",[company,ids.worker2])
await role('authenticated',ids.worker2)
await error(()=>rpc('obtener_plan_hitos',[companyJob]),/permiso/,'Revoked company operator loses plan read access')
await error(()=>rpc('proponer_plan_trabajo',[companyJob,'hitos',JSON.stringify(companyPlan),1]),/permiso/,'Revoked company operator cannot propose changes')
// Stripe EUR per-charge limits apply to the final customer total including fees.
await role('authenticated',ids.client)
const limitRequest=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Límites de cobro','Prueba','Madrid') returning id",[ids.client])).id
await role('authenticated',ids.owner)
await error(()=>db.query("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,1,3,'Mínimo','hitos',$3,10,2,1,0)",[limitRequest,ids.owner,JSON.stringify([stage('Insuficiente',49),stage('Resto',51)])]),/mínimo de 0,50/,'SQL rejects contractual stages below EUR 0.50')
const limitPlan=[stage('Límite exacto',90_909_090),stage('Último',50)]
const limitOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,909091.40,3,'Máximo','hitos',$3,10,2,90909.14,818182.26) returning id",[limitRequest,ids.owner,JSON.stringify(limitPlan)])).id
await role('authenticated',ids.client)
const limitJob=(await rpc('aceptar_oferta_y_crear_trabajo',[limitOffer,limitRequest,ids.owner,null,1])).trabajo.id
await role('postgres')
await db.query("update public.trabajos set proveedor_stripe_account_id='acct_owner' where id=$1",[limitJob])
await role('service_role')
const limitEscrow=await rpc('preparar_pago_hito',[limitJob,limitPlan[0].id,ids.client])
check(Number(limitEscrow.monto)===999999.99,'SQL allows exactly EUR 999999.99 including assigned fee')
await db.query("update public.transacciones_escrow set estado='cancelado' where id=$1",[limitEscrow.id])
// Defense in depth against a malformed future row inserted by a privileged caller.
await db.query('update public.trabajos_hitos set importe_centimos=importe_centimos+1 where id=$1',[limitPlan[0].id])
await error(()=>rpc('preparar_pago_hito',[limitJob,limitPlan[0].id,ids.client]),/999.999,99/,'Preparing a payment rechecks the maximum including customer fee')
await role('authenticated',ids.client)
const largeRequest=(await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Importe demasiado grande','Prueba','Madrid') returning id",[ids.client])).id
await role('authenticated',ids.owner)
const largePlan=[stage('Sobredimensionado',90_909_091),stage('Último',50)]
const largeOffer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,modalidad_pago,plan_hitos,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,909091.41,3,'Máximo','hitos',$3,10,2,90909.14,818182.27) returning id",[largeRequest,ids.owner,JSON.stringify(largePlan)])).id
await role('authenticated',ids.client)
await error(()=>rpc('aceptar_oferta_y_crear_trabajo',[largeOffer,largeRequest,ids.owner,null,1]),/999.999,99/,'Contract acceptance refuses a stage one cent above Checkout maximum')
await role('postgres')
check((await one('select count(*)::int n from public.trabajos where oferta_id=$1',[largeOffer])).n===0,'Invalid monetary plan rolls back the entire contract creation')
console.log(`Milestone plan database checks: ${checks} passed`)
await db.close()
