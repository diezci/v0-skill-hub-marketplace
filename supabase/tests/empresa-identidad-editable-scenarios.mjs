export async function testIdentidadEditableEmpresa({ db, asRole, one, rpc, check, expectError }) {
  const actors = Object.fromEntries(['owner', 'editor', 'other'].map((name, i) => [name, `83000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  await asRole()
  const historical = await one('select jsonb_agg(to_jsonb(f) order by trabajo_id) datos from diime_private.trabajos_facturacion f')
  const legacyDefinition = (await one("select pg_get_functiondef('diime_private.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean)'::regprocedure) definition")).definition
  check(!/\bdomicilio\s*=/.test(legacyDefinition), 'RPC de perfil nunca escribe domicilio: un guardado concurrente no puede heredar una comprobación ajena')
  for (const [name,id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`identity-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)',[id,`identity-${name}@example.test`,name])
  }
  await asRole('authenticated',actors.owner)
  const company=await rpc('vincular_mi_empresa',[null,'Empresa original SL','B83000001','DOC','Administrador único',null,'Madrid'])
  const invitation=await rpc('empresa_crear_invitacion',['identity-editor@example.test','Editor','miembro',JSON.stringify({perfil:true}),false])
  await asRole('authenticated',actors.editor);await rpc('empresa_aceptar_invitacion',[invitation.token])
  const anterior={razonSocial:'Empresa original SL',cif:'B83000001',domicilio:''}
  const domicilio='CALLE VELAZQUEZ 83, Madrid, 28006, Madrid, España'
  const proof={id:'13.PV.MUN_280790752919',domicilio,latitud:40.433,longitud:-3.683,comprobadoEn:new Date().toISOString()}
  const save=(actor,fields={},before=anterior,verified=null)=>rpc('empresa_guardar_datos_legales',[company,actor,fields.razonSocial??before.razonSocial,fields.cif??before.cif,fields.domicilio??before.domicilio,JSON.stringify(before),verified?JSON.stringify(verified):null])
  await expectError(()=>save(actors.owner,{domicilio},anterior,proof),/permission denied/,'Sesión autenticada no puede falsificar una comprobación del servidor')
  await asRole('anon');await expectError(()=>save(actors.owner),/permission denied/,'Anónimo no modifica identidad')
  await asRole('service_role');await expectError(()=>save(actors.other),/No tienes permiso/,'RPC servidor vuelve a comprobar pertenencia del actor')
  await expectError(()=>save(actors.editor,{razonSocial:'Suplantada SL'}),/principal/,'Permiso perfil no permite modificar identidad')
  await expectError(()=>save(actors.owner,{domicilio}),/Busca y selecciona/,'Domicilio nuevo exige comprobación')
  await expectError(()=>save(actors.owner,{domicilio},anterior,{...proof,domicilio:'Otro portal'}),/no corresponde/,'Comprobación debe corresponder al texto guardado')
  await save(actors.editor,{domicilio},anterior,proof)
  await asRole('authenticated',actors.owner)
  let state=await rpc('empresa_workspace')
  check(state.empresa.domicilio===domicilio && !!state.empresa.domicilio_comprobado_en,'Dirección localizada y fecha persisten y se recuperan')
  await rpc('empresa_editar_perfil_profesional',['Marca compatible','Descripción','Madrid',null,null,['Fontanería'],['Madrid'],null,null,null,JSON.stringify({domicilio,titulo:'Presentación actualizada'}),false,false])
  const afterLegacy = (await rpc('empresa_workspace')).empresa
  check(afterLegacy.domicilio === state.empresa.domicilio && afterLegacy.domicilio_comprobado_en === state.empresa.domicilio_comprobado_en, 'Cliente antiguo con domicilio sin cambios puede guardar el perfil sin modificar dirección ni comprobación')
  await expectError(()=>rpc('empresa_editar_perfil_profesional',['Marca','Descripción','Madrid',null,null,['Fontanería'],['Madrid'],null,null,null,JSON.stringify({domicilio:'Inventado'}),false,false]),/Datos legales/,'Editor antiguo no evita comprobación de dirección')
  await asRole('service_role')
  await expectError(()=>save(actors.owner,{razonSocial:'Empresa corregida SL'}),/han cambiado/,'Edición obsoleta no pisa datos nuevos')
  const conDireccion={...anterior,domicilio}
  await asRole('authenticated',actors.owner)
  await rpc('empresa_solicitar_verificacion',['documental','Representante','Administrador único','poder.pdf',Buffer.from('%PDF-test').toString('base64'),true])
  await asRole('service_role')
  await save(actors.owner,{razonSocial:'Empresa corregida SL',cif:'B83000002'},conDireccion)
  await asRole()
  const e=await one('select * from public.empresas where id=$1',[company])
  check(e.razon_social==='Empresa corregida SL' && e.cif==='B83000002','Principal corrige razón social y CIF')
  check(e.estado_verificacion==='requiere_informacion' && e.verificada===false,'Identidad nueva requiere acreditación')
  check((await one('select count(*)::int n from diime_private.empresa_verificaciones where empresa_id=$1 and estado=\'en_revision\'',[company])).n===0,'Expediente pendiente antiguo no puede aprobar identidad nueva')
  check((await one('select actor_usuario_id from public.empresa_actividad where empresa_id=$1 order by created_at desc limit 1',[company])).actor_usuario_id===actors.owner,'Auditoría conserva actor autenticado')
  await asRole('anon');check(await rpc('empresa_perfil_publico',[company])===null,'Perfil queda oculto mientras se reacredita identidad')
  await asRole()
  check(JSON.stringify((await one('select jsonb_agg(to_jsonb(f) order by trabajo_id) datos from diime_private.trabajos_facturacion f')).datos)===JSON.stringify(historical.datos),'Corrección de identidad no cambia snapshots fiscales históricos')
  await asRole('service_role');await save(actors.owner,{domicilio:''},{razonSocial:e.razon_social,cif:e.cif,domicilio})
  await asRole();check((await one('select domicilio_comprobado_en from public.empresas where id=$1',[company])).domicilio_comprobado_en===null,'Quitar dirección elimina comprobación anterior')
}
