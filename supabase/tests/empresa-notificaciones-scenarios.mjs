// Exercise the actual BEFORE INSERT trigger with revoked members, permissions,
// account deletion, and mixed personal/company contractual sides.
export async function testAvisosEmpresa({db,asRole,ids,one,check}) {
  await asRole()
  async function notify(user, tipo='cancelacion_solicitada', extra={}) {
    return one("insert into notificaciones(usuario_id,tipo,titulo,mensaje,link,metadata) values($1,$2,'Aviso sintético','Detalle contractual','/mis-trabajos',$3) returning usuario_id,link,metadata",[user,tipo,JSON.stringify({trabajo_id:ids.job,...extra})])
  }
  let notice=await notify(ids.member)
  check(notice?.usuario_id===ids.owner,'Revoked original provider never receives persisted company notice; principal receives it')
  check(notice.link==='/perfil-empresa' && notice.metadata.parte_destinataria==='proveedor','Redirected notice retains company contractual side')
  check((await one("select count(*)::int n from notificaciones where usuario_id=$1 and titulo='Aviso sintético'",[ids.member])).n===0,'Revoked staff notice was not inserted at any point')
  notice=await notify(ids.worker2)
  check(notice?.usuario_id===ids.owner,'Assigned operator without work permission falls back to active principal')
  await db.query("update empresa_miembros set permisos=permisos||'{\"encargos\":true,\"ver_cobros\":false}'::jsonb where empresa_id=$1 and usuario_id=$2",[ids.company,ids.worker2])
  notice=await notify(ids.worker2)
  check(notice?.usuario_id===ids.worker2,'Active assigned operator receives permitted work notice')
  notice=await notify(ids.worker2,'pago_liberado')
  check(notice?.usuario_id===ids.owner,'Financial amount is not sent to work-only operator')
  await db.query("update empresa_miembros set permisos=permisos||'{\"ver_cobros\":false}'::jsonb where empresa_id=$1 and usuario_id=$2",[ids.company,ids.admin])
  notice=await notify(ids.admin,'pago_liberado',{parte_destinataria:'proveedor'})
  check(notice?.usuario_id===ids.owner,'Admin without finance permission cannot receive net amount')
  notice=await notify(ids.client,'pago_liberado')
  check(notice?.usuario_id===ids.client && notice.link==='/mis-trabajos','Personal contractual side remains unchanged in mixed contract')
  notice=await notify(ids.platformAdmin,'disputa_abierta_admin')
  check(notice?.usuario_id===ids.platformAdmin,'Separate platform administration notice is untouched')
  await db.query("update profiles set cuenta_eliminada=now() where id=$1",[ids.owner])
  notice=await notify(ids.member)
  check(notice===undefined,'No eligible company recipient suppresses detail instead of writing a revoked recipient')
  notice=await notify(ids.client)
  check(notice?.usuario_id===ids.client,'Personal party notification remains available when company has no recipient')
  await db.query('update profiles set cuenta_eliminada=null where id=$1',[ids.owner])
}
