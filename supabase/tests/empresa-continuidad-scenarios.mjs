// Local SQL regression; real HTTP/Auth coverage is recorded separately in e2e evidence.
export async function testContinuidadSolicitudesEmpresa({db,asRole,ids,one,rpc,check,expectError}) {
 const contract = async (...args) => (await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value',args)).value
 const denied = async (fn,pattern,message) => { await db.exec('savepoint negative_case'); try { await expectError(async()=>{try {await fn()}catch(error){if(!pattern.test(error.message))console.error('Unexpected fixture error:',error.message);throw error}},pattern,message) } finally { await db.exec('rollback to negative_case'); await db.exec('release negative_case') } }
 const all={perfil:true,mensajes:true,presupuestos:true,encargos:true,equipo:true,ver_cobros:true,gestionar_cobros:true}
 await asRole();await db.exec('begin')
 try {
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1",[ids.company])
  for(const who of [ids.member,ids.worker2,ids.admin])await db.query("update public.empresa_miembros set estado='activo',revocado_at=null,permisos=$2::jsonb where usuario_id=$1 and empresa_id=$3",[who,JSON.stringify(all),ids.company])
  const fixtures=[]
  for(let i=0;i<2;i++){
   await asRole('authenticated',ids.member)
   const request=(await one("insert into public.solicitudes(cliente_id,empresa_id,titulo,descripcion,ubicacion) values($1,$2,'Continuidad empresa','Descripción histórica','Madrid') returning id",[ids.member,ids.company])).id
   await asRole('authenticated',ids.outsider)
   const offer=(await one("insert into public.ofertas(solicitud_id,profesional_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,100,2,'Oferta sintética',5,0,5,95) returning id",[request,ids.outsider])).id
   fixtures.push({request,offer})
  }
  await asRole('authenticated',ids.owner)
  await rpc('empresa_actualizar_miembro',[ids.member,'Revocado',true])
  for(const who of [ids.member,ids.worker2,ids.outsider]){
   await asRole('authenticated',who)
   await denied(()=>rpc('aceptar_oferta_y_crear_trabajo',[fixtures[0].offer,fixtures[0].request,ids.outsider]),/No tienes permiso/,'Ajeno, miembro común y autor revocado no contratan')
   await denied(()=>rpc('empresa_oferta_para_contratar',[fixtures[0].offer]),/No tienes permiso/,'Proyección estrecha no permite leer oferta sin autoridad')
  }
  await asRole('authenticated',ids.owner)
  await rpc('empresa_actualizar_miembro',[ids.admin,'Sin encargos',false,'administrador',JSON.stringify({...all,encargos:false})])
  await asRole('authenticated',ids.admin)
  await denied(()=>rpc('aceptar_oferta_y_crear_trabajo',[fixtures[0].offer,fixtures[0].request,ids.outsider]),/No tienes permiso/,'Rol administrador no sustituye permiso encargos')
  await asRole('authenticated',ids.owner)
  await rpc('empresa_actualizar_miembro',[ids.admin,'Con encargos',false,'administrador',JSON.stringify(all)])
  for(const [index,who]of [ids.owner,ids.admin].entries()){
   const f=fixtures[index];await asRole('authenticated',who)
   const projection=await rpc('empresa_oferta_para_contratar',[f.offer]);check(projection.solicitud.cliente_id===ids.member,'Proyección conserva cliente original')
   const result=await contract(f.offer,f.request,ids.outsider),job=result.trabajo
   check(job.cliente_id===ids.member&&job.actor_contratacion_id===who&&job.operador_cliente_id===who,'Contrato conserva cliente y registra actor/operador vigente')
   check(job.empresa_cliente_id===ids.company&&job.profesional_id===ids.outsider,'Empresa y proveedor permanecen sellados')
   const retry=await contract(f.offer,f.request,ids.outsider);check(retry.reutilizado&&retry.trabajo.id===job.id,'Reintento no duplica contrato')
   check(await rpc('empresa_puede_operar_trabajo',[job.id,'encargos','cliente'])===true,'Actor vigente puede continuar el trabajo')
   await asRole('authenticated',ids.member)
   await denied(()=>contract(f.offer,f.request,ids.outsider),/No tienes permiso/,'Reintento histórico revocado sigue denegado')
  }
 } finally {await db.exec('rollback');await asRole()}
}
