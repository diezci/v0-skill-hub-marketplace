export async function testDomicilioEmpresa({ db, asRole, one, rpc, check, expectError }) {
  const actors = Object.fromEntries(['owner', 'editor', 'reader', 'other'].map((name, i) => [name, `82000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  await asRole()
  const historical = await one('select jsonb_agg(to_jsonb(f) order by trabajo_id) datos from diime_private.trabajos_facturacion f')
  for (const [name,id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`address-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)',[id,`address-${name}@example.test`,name])
  }
  await asRole('authenticated',actors.owner)
  const company=await rpc('vincular_mi_empresa',[null,'Razón social registrada SL','B82000001','DOCUMENTO PRIVADO','Dirección','666333444','Madrid'])
  for (const name of ['editor','reader']) {
    const invitation=await rpc('empresa_crear_invitacion',[`address-${name}@example.test`,'Cargo','miembro',JSON.stringify({perfil:name==='editor'}),false])
    await asRole('authenticated',actors[name]);await rpc('empresa_aceptar_invitacion',[invitation.token]);await asRole('authenticated',actors.owner)
  }
  const base=['Marca comercial','Descripción','Bizkaia','https://example.test',null,['Fontanería'],['Madrid','Bizkaia']]
  const save=(fields)=>rpc('empresa_editar_perfil_profesional',[...base,null,500,5000,JSON.stringify(fields),false,true])
  check((await rpc('empresa_perfil_vista_previa')).empresa.domicilio===null,'El domicilio empieza vacío; no hereda la provincia ni un dato personal')
  const domicilio='Calle de Ejemplo 12, 2.º A\n48001 Bilbao, Bizkaia'
  await asRole('authenticated',actors.editor)
  await save({domicilio:`  ${domicilio}  `})
  for(const payload of [await rpc('empresa_workspace'),await rpc('empresa_perfil_vista_previa')]) {
    check(payload.empresa.domicilio===domicilio,'Domicilio público completo y multilínea persiste tras recarga')
    check(payload.empresa.razon_social==='Razón social registrada SL' && payload.empresa.cif==='B82000001','Editor ve razón social y CIF registrados sin alterarlos')
    check(payload.empresa.ubicacion==='Bizkaia' && payload.empresa.provincias.join(',')==='Madrid,Bizkaia','Domicilio no sustituye ubicación ni cobertura')
  }
  await save({titulo:'Solo otro campo'})
  check((await rpc('empresa_perfil_vista_previa')).empresa.domicilio===domicilio,'Parche que omite domicilio conserva dirección guardada')
  await rpc('empresa_editar_perfil_cobertura',base)
  check((await rpc('empresa_perfil_vista_previa')).empresa.domicilio===domicilio,'Editor antiguo no borra domicilio')
  for(const fields of [{domicilio:null},{domicilio:9},{domicilio:[]},{domicilio:'x'.repeat(501)},{domicilio:'x\u0001y'},{domicilio:'x\ty'},{nif:'B99999999'},{cif:'B99999999'},{razonSocial:'Otra entidad'}]) {
    await expectError(()=>save(fields),/Revisa/,'RPC valida domicilio y rechaza mutaciones de identidad legal')
  }
  check((await rpc('empresa_perfil_vista_previa')).empresa.domicilio===domicilio,'Validación fallida mantiene dirección guardada')
  await asRole('authenticated',actors.reader)
  check((await rpc('empresa_workspace')).empresa.cif==='B82000001','Miembro sin edición puede leer identidad corporativa pública')
  await expectError(()=>save({domicilio:'No autorizado'}),/No tienes permiso/,'Lector no puede modificar domicilio')
  await asRole('authenticated',actors.other);await expectError(()=>save({domicilio:'Ajeno'}),/No tienes permiso/,'Ajeno no cambia dirección')
  await asRole('anon')
  check(await rpc('empresa_perfil_publico',[company])===null,'Dirección e identidad de empresa no verificada no son públicas')
  await expectError(()=>save({domicilio:'Anónimo'}),/permission denied/,'Anónimo no edita domicilio')
  await asRole();await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1",[company])
  await asRole('anon')
  for(const e of [(await rpc('empresa_perfil_publico',[company])).empresa,(await rpc('empresas_publicas')).find(e=>e.id===company)]) {
    check(e.razon_social==='Razón social registrada SL' && e.cif==='B82000001' && e.domicilio===domicilio,'Ficha y directorio publican solo identidad empresarial y domicilio declarado')
    check(!['email','telefono','documento','representante_nombre','cargo_legal','presupuesto_min_interes','presupuesto_max_interes'].some(k=>k in e),'Contacto de registro, representación y preferencias siguen privados')
  }
  const serialized=JSON.stringify(await rpc('empresa_perfil_publico',[company]))
  check(!/DOCUMENTO PRIVADO|address-owner@example|666333444/.test(serialized),'Publicar CIF empresarial no publica documento o contacto personal')
  await asRole('authenticated',actors.editor);await save({domicilio:''})
  check((await rpc('empresa_perfil_vista_previa')).empresa.domicilio===null,'Borrado explícito de domicilio persiste')
  await asRole('authenticated',actors.owner);await rpc('empresa_actualizar_miembro',[actors.editor,null,true,null,null,null])
  await asRole('authenticated',actors.editor);await expectError(()=>save({domicilio:'Revocado'}),/No tienes permiso/,'Revocación corta permiso de edición con sesión existente')
  await asRole()
  check(JSON.stringify((await one('select jsonb_agg(to_jsonb(f) order by trabajo_id) datos from diime_private.trabajos_facturacion f')).datos)===JSON.stringify(historical.datos),'La edición del domicilio no altera snapshots fiscales históricos')
  const e=await one('select razon_social,cif,estado_verificacion from public.empresas where id=$1',[company])
  check(e.razon_social==='Razón social registrada SL' && e.cif==='B82000001' && e.estado_verificacion==='verificada','La ficha no altera identidad ni acreditación registrada')
}
