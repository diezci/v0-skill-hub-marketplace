import assert from 'node:assert/strict'

export async function testVistaPreviaEmpresa({ db, asRole, ids, one, rpc, check, expectError }) {
  const actors = Object.fromEntries(['owner', 'editor', 'admin', 'reader', 'hidden', 'revoked', 'deleted', 'otherOwner'].map((name, index) => [name, `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]))
  await asRole()
  for (const [name, id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `preview-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)', [id, `preview-${name}@example.test`, `Persona ${name}`])
    if (['editor', 'hidden'].includes(name)) await db.query("insert into public.profesionales(id,titulo) values($1,'Profesional de prueba')", [id])
  }
  await asRole('authenticated', actors.owner)
  const company = await rpc('vincular_mi_empresa', [null, 'Empresa privada para vista previa', 'B50000001', 'DOC', 'Dirección', null, 'Madrid'])
  await rpc('empresa_editar_perfil_cobertura', ['Marca de la vista previa', 'Presentación pública', '', 'https://example.test', 'https://example.test/logo.webp', ['Fontanería', 'Electricidad'], ['Madrid', 'Toledo']])
  for (const name of ['editor', 'admin', 'reader', 'hidden', 'revoked', 'deleted']) {
    await asRole('authenticated', actors.owner)
    const invitation = await rpc('empresa_crear_invitacion', [`preview-${name}@example.test`, `Cargo ${name}`, name === 'admin' ? 'administrador' : 'miembro', JSON.stringify({ perfil: name === 'editor', presupuestos: ['editor', 'hidden'].includes(name) }), ['editor', 'revoked', 'deleted'].includes(name)])
    await asRole('authenticated', actors[name])
    await rpc('empresa_aceptar_invitacion', [invitation.token])
  }
  await asRole('authenticated', actors.otherOwner)
  const otherCompany = await rpc('vincular_mi_empresa', [null, 'Empresa ajena', 'B50000002', 'DOC', 'Dirección', null, 'Madrid'])
  check((await rpc('empresa_perfil_vista_previa')).empresa.id === otherCompany, 'Otro titular solo obtiene la vista previa de su propia empresa')
  await expectError(() => rpc('empresa_perfil_vista_previa', [company]), /does not exist/, 'No existe sobrecarga con ID para abrir una empresa ajena')

  // Real contractual paths seed portfolio/reviews; returning to draft is test-only setup.
  await asRole()
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company])
  const makeJob = async (professional, enterprise, title) => {
    await asRole('authenticated', ids.client)
    const request = (await one("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,$2,'Descripción','Madrid') returning id", [ids.client, title])).id
    await asRole('authenticated', professional)
    const offer = (await one("insert into public.ofertas(solicitud_id,profesional_id,empresa_id,precio,tiempo_estimado,descripcion,comision_proveedor_porcentaje,comision_proveedor_minima,comision_proveedor_prevista,pago_neto_proveedor_previsto) values($1,$2,$3,123.45,2,'Oferta',10,2,12.35,111.10) returning id", [request, professional, enterprise])).id
    await asRole('authenticated', ids.client)
    return (await one('select private.aceptar_oferta_y_crear_trabajo($1,$2,$3) value', [offer, request, professional])).value.trabajo.id
  }
  const visibleJob = await makeJob(actors.editor, company, 'Proyecto visible')
  const hiddenActorJob = await makeJob(actors.hidden, company, 'Proyecto con persona oculta')
  const personalJob = await makeJob(actors.editor, null, 'Proyecto personal secreto')
  await asRole()
  for (const [job, professional, title, visible] of [[visibleJob, actors.editor, 'Portfolio visible', true], [visibleJob, actors.editor, 'PORTFOLIO OCULTO', false], [hiddenActorJob, actors.hidden, 'Trabajo de empresa sin mostrar participante', true], [personalJob, actors.editor, 'PORTFOLIO PERSONAL', true]]) {
    await db.query('insert into public.portfolio(trabajo_id,profesional_id,titulo,presupuesto,visible) values($1,$2,$3,123.45,$4)', [job, professional, title, visible])
  }
  await db.query('insert into public."reseñas"(trabajo_id,autor_id,profesional_id,rating,comentario) values($1,$2,$3,5,$4),($5,$2,$3,1,$6)', [visibleJob, ids.client, actors.editor, 'Reseña empresarial pública', personalJob, 'RESEÑA PERSONAL'])
  await db.query("update public.empresas set estado_verificacion='borrador',verificada=false,email='INTERNO@example.test',telefono='SECRETO' where id=$1", [company])
  await db.query('update public.profiles set cuenta_eliminada=now() where id=$1', [actors.deleted])
  await asRole('authenticated', actors.owner)
  await rpc('empresa_actualizar_miembro', [actors.revoked, null, true, null, null, null])
  const before = await rpc('empresa_workspace')
  const preview = await rpc('empresa_perfil_vista_previa')
  const after = await rpc('empresa_workspace')
  check(preview.empresa.id === company && preview.empresa.nombre === 'Marca de la vista previa', 'Responsable principal ve contenido guardado del borrador')
  check(preview.empresa.estado_verificacion === 'borrador' && preview.empresa.verificada === false, 'Vista previa conserva estado real sin insignia ficticia')
  check(preview.empresa.provincias.join('|') === 'Madrid|Toledo' && preview.empresa.servicios.join('|') === 'Fontanería|Electricidad', 'Proyección compartida conserva cobertura y servicios canónicos')
  check(preview.miembros.length === 1 && preview.miembros[0].usuario_id === actors.editor, 'Solo muestra miembros activos con visibilidad pública y cuenta abierta')
  check(preview.miembros[0].tiene_perfil_profesional === true, 'Conserva flag de enlace al perfil profesional real')
  check(preview.portfolio.length === 2 && preview.resenas.length === 1, 'Portfolio y reseñas conservan alcance empresa y visibilidad')
  check(preview.portfolio.find(p => p.trabajo_id === visibleJob).participantes_ids[0] === actors.editor, 'Portfolio conserva participante visible')
  check(preview.portfolio.find(p => p.trabajo_id === hiddenActorJob).participantes_ids.length === 0, 'Portfolio no identifica a participantes del equipo oculto')
  check(preview.portfolio.every(p => p.rango_precio === '100–250 €' && !('presupuesto' in p)), 'Portfolio mantiene rango público sin precio exacto')
  const serialized = JSON.stringify(preview)
  check(!/cif|email|telefono|permisos|actividad|invitaciones|documento|B50000001|INTERNO|SECRETO|PORTFOLIO OCULTO|PORTFOLIO PERSONAL|RESEÑA PERSONAL/.test(serialized), 'Payload privado devuelve exclusivamente contenido de perfil público')
  check(![actors.hidden, actors.revoked, actors.deleted, actors.admin, actors.reader].some(id => serialized.includes(id)), 'No revela IDs de equipo oculto, revocado o eliminado')
  assert.deepEqual(after, before)
  check(after.actividad.length === before.actividad.length, 'Leer vista previa no modifica estado, perfil ni auditoría')

  await asRole('authenticated', actors.admin)
  check((await rpc('empresa_perfil_vista_previa')).empresa.id === company, 'Administrador activo sin permiso perfil puede supervisar la vista previa')
  await asRole('authenticated', actors.editor)
  check((await rpc('empresa_perfil_vista_previa')).empresa.id === company, 'Miembro editor puede ver la vista previa')
  await asRole('authenticated', actors.reader)
  await expectError(() => rpc('empresa_perfil_vista_previa'), /No tienes permiso/, 'Miembro sin rol gestor ni permiso perfil no accede')
  await asRole('authenticated', ids.platformAdmin)
  check(await rpc('empresa_perfil_vista_previa') === null, 'Administrador de plataforma ajeno no accede por su rol global')
  await asRole('authenticated', ids.outsider)
  check(await rpc('empresa_perfil_vista_previa') === null, 'Usuario ajeno no recibe datos')
  for (const name of ['revoked', 'deleted']) {
    await asRole('authenticated', actors[name])
    check(await rpc('empresa_perfil_vista_previa') === null, `Miembro ${name} no obtiene vista previa con sesión existente`)
  }
  await asRole('authenticated')
  await expectError(() => rpc('empresa_perfil_vista_previa'), /iniciar sesión/, 'Rol authenticated sin usuario autenticado no obtiene datos')
  await asRole('anon')
  await expectError(() => rpc('empresa_perfil_vista_previa'), /permission denied/, 'Anónimo no ejecuta preview')
  await expectError(() => db.query('select diime_private.empresa_perfil_vista_previa()'), /permission denied/, 'Anónimo tampoco ejecuta wrapper privado')
  check(await rpc('empresa_perfil_publico', [company]) === null && !(await rpc('empresas_publicas')).some(e => e.id === company), 'Preview no publica borrador en perfil o directorio')
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await asRole(role, role === 'authenticated' ? actors.owner : null)
    await expectError(() => db.query('select diime_private.empresa_perfil_contenido_publico($1)', [company]), /permission denied/, 'Builder común no es un bypass accesible por roles de API')
  }
  await asRole('authenticated', actors.owner)
  await rpc('empresa_actualizar_miembro', [actors.editor, 'Editor sin acceso al perfil', false, 'miembro', JSON.stringify({ presupuestos: true }), true])
  await asRole('authenticated', actors.editor)
  await expectError(() => rpc('empresa_perfil_vista_previa'), /No tienes permiso/, 'Retirar permiso perfil a editor corta la siguiente lectura')

  await asRole()
  await db.query("update public.empresas set estado_verificacion='en_revision' where id=$1", [company])
  await asRole('authenticated', actors.owner)
  check((await rpc('empresa_perfil_vista_previa')).empresa.estado_verificacion === 'en_revision', 'Estado en revisión tampoco se transforma en verificado')
  await asRole()
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company])
  await asRole('authenticated', actors.owner)
  const verifiedPreview = await rpc('empresa_perfil_vista_previa')
  await asRole('anon')
  assert.deepEqual(await rpc('empresa_perfil_publico', [company]), verifiedPreview)
  check(verifiedPreview.empresa.verificada === true, 'Empresa verificada tiene exactamente el mismo payload público y de preview')
  await asRole()
  await db.query('update public.profiles set cuenta_eliminada=now() where id=$1', [actors.owner])
  await asRole('authenticated', actors.admin)
  check(await rpc('empresa_perfil_vista_previa') === null, 'Cierre de cuenta del titular corta vista previa incluso para administrador activo')
  await asRole('anon')
  check(await rpc('empresa_perfil_publico', [company]) === null, 'Cierre de titular conserva cierre del perfil público')
  await asRole()
  check((await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='empresa_perfil_vista_previa' and p.pronargs=0 and not p.prosecdef")).n === 1, 'Endpoint preview único, sin parámetros y security invoker')
}
