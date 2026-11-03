export async function testPresentacionEmpresa({ db, asRole, one, rpc, check, expectError }) {
  const actors = Object.fromEntries(['owner', 'editor', 'reader', 'other'].map((name, i) => [name, `70000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  await asRole()
  for (const [name, id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `presentation-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)', [id, `presentation-${name}@example.test`, name])
  }
  await asRole('authenticated', actors.owner)
  const company = await rpc('vincular_mi_empresa', [null, 'Empresa con portada', 'B70000001', 'DOC', 'Dirección', null, 'Madrid'])
  for (const name of ['editor', 'reader']) {
    const invitation = await rpc('empresa_crear_invitacion', [`presentation-${name}@example.test`, 'Cargo', 'miembro', JSON.stringify({ perfil: name === 'editor' }), false])
    await asRole('authenticated', actors[name]); await rpc('empresa_aceptar_invitacion', [invitation.token]); await asRole('authenticated', actors.owner)
  }
  const base = ['Empresa actualizada', 'Descripción pública', '', 'https://example.test', 'https://example.test/avatar.webp', ['Fontanería'], ['Madrid']]
  const save = (cover='https://example.test/cover.webp', min=500, max=10000, flags=[]) => rpc('empresa_editar_perfil_completo', [...base, cover, min, max, ...flags])
  const before = (await rpc('empresa_workspace')).actividad.length
  await save()
  let workspace = await rpc('empresa_workspace')
  check(workspace.empresa.foto_portada === 'https://example.test/cover.webp' && workspace.empresa.logo === 'https://example.test/avatar.webp', 'Foto y portada distintas se conservan tras guardar y recargar workspace')
  check(workspace.empresa.presupuesto_min_interes === 500 && workspace.empresa.presupuesto_max_interes === 10000, 'Rango privado persistido en workspace')
  check(workspace.actividad.length === before + 1, 'Guardar perfil completo registra un único evento de actividad')
  const preview = await rpc('empresa_perfil_vista_previa')
  check(preview.empresa.foto_portada === workspace.empresa.foto_portada && preview.empresa.presupuesto_max_interes === 10000, 'Vista previa recupera portada y rango guardados')
  await asRole(); await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company]); await asRole('anon')
  const publico = await rpc('empresa_perfil_publico', [company])
  check(publico.empresa.foto_portada === 'https://example.test/cover.webp', 'Portada visible públicamente')
  check(!JSON.stringify(publico).includes('presupuesto_min_interes') && !JSON.stringify(publico).includes('presupuesto_max_interes'), 'Perfil público no revela los filtros privados de avisos')
  check(!JSON.stringify(await rpc('empresas_publicas')).includes('presupuesto_min_interes'), 'Directorio no revela rango privado')
  await expectError(() => save(), /permission denied/, 'Anónimo no cambia portada ni rango')
  await asRole('authenticated', actors.reader); await expectError(() => save(), /No tienes permiso/, 'Miembro sin permiso de perfil no escribe')
  await asRole('authenticated', actors.other); await expectError(() => save(), /No tienes permiso/, 'Ajeno no escribe empresa')
  await asRole('authenticated', actors.editor)
  await save('https://example.test/editor.webp', 1000, 2000)
  check((await rpc('empresa_perfil_vista_previa')).empresa.foto_portada === 'https://example.test/editor.webp', 'Miembro editor guarda la portada y rango con su JWT')
  for (const [min, max] of [[-1, 10], [20, 10], [0, 100001], ['NaN', 1000], [1000, 'Infinity']]) {
    await expectError(() => save('https://example.test/rejected.webp', min, max), /presupuesto/, 'Límites inválidos no se guardan')
  }
  await expectError(() => save('javascript:alert(1)'), /portada/, 'Rechaza portada insegura')
  await expectError(() => save('http://example.test/image.webp'), /portada/, 'Portada exige HTTPS')
  check((await rpc('empresa_perfil_vista_previa')).empresa.foto_portada === 'https://example.test/editor.webp', 'Error valida antes de cambiar datos')
  await rpc('empresa_editar_perfil_cobertura', base)
  check((await rpc('empresa_perfil_vista_previa')).empresa.presupuesto_min_interes === 1000, 'Editor antiguo conserva rango y portada')
  await save(null, 2000, 3000, [false, true])
  check((await rpc('empresa_perfil_vista_previa')).empresa.foto_portada === 'https://example.test/editor.webp', 'Cambiar solo rango conserva portada')
  await save('https://example.test/new.webp', null, null, [true, false])
  check((await rpc('empresa_perfil_vista_previa')).empresa.presupuesto_max_interes === 3000, 'Cambiar solo portada conserva rango')
  await save(null, 0, 100000)
  const abierto = (await rpc('empresa_perfil_vista_previa')).empresa
  check(abierto.foto_portada === null && abierto.presupuesto_min_interes === null && abierto.presupuesto_max_interes === null, 'Quitar portada y cualquier presupuesto se guardan como null')
  await asRole('authenticated', actors.owner)
  await rpc('empresa_actualizar_miembro', [actors.editor, null, true, null, null, null])
  await asRole('authenticated', actors.editor); await expectError(() => save(), /No tienes permiso/, 'Revocación corta guardado con sesión existente')
  await asRole()
  check(!(await one("select prosecdef from pg_proc where oid='public.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean)'::regprocedure")).prosecdef, 'Endpoint público es security invoker')
  for (const role of ['anon', 'service_role']) check(!(await one("select has_function_privilege($1,'public.empresa_editar_perfil_completo(text,text,text,text,text,text[],text[],text,numeric,numeric,boolean,boolean)','execute') permitido", [role])).permitido, 'Solo authenticated puede ejecutar nuevo RPC')
}
