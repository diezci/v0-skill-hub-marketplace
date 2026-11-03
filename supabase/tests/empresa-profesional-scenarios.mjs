export async function testProfesionalEmpresa({ db, asRole, one, rpc, check, expectError }) {
  const actors = Object.fromEntries(['owner', 'editor', 'reader', 'other'].map((name, i) => [name, `81000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  await asRole()
  for (const [name, id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `professional-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)', [id, `professional-${name}@example.test`, name])
  }
  await asRole('authenticated', actors.owner)
  const company = await rpc('vincular_mi_empresa', [null, 'Empresa profesional', 'B81000001', 'DOC', 'Dirección', '666111222', 'Madrid'])
  for (const name of ['editor', 'reader']) {
    const invite = await rpc('empresa_crear_invitacion', [`professional-${name}@example.test`, 'Cargo', 'miembro', JSON.stringify({ perfil: name === 'editor' }), false])
    await asRole('authenticated', actors[name]); await rpc('empresa_aceptar_invitacion', [invite.token]); await asRole('authenticated', actors.owner)
  }
  let preview = await rpc('empresa_perfil_vista_previa')
  check(preview.empresa.telefono_contacto === null && preview.empresa.email_contacto === null, 'El contacto de registro nunca se convierte automáticamente en contacto público')
  const base = ['Empresa profesional', 'Descripción breve', 'Bizkaia', 'https://example.test', 'https://example.test/logo.webp', ['Fontanería'], ['Madrid', 'Bizkaia']]
  const data = { titulo: 'Instalaciones y mantenimiento', telefono: '+34 944000000', emailContacto: 'CONTACTO@empresa.test', tarifaHora: 48.5, anosExperiencia: 12, tiempoRespuesta: '12 horas', disponible: false, habilidades: ['Fontanería', 'Reparaciones'], certificaciones: ['Instalador autorizado'], idiomas: ['Español', 'Euskera'] }
  const save = (fields = data) => rpc('empresa_editar_perfil_profesional', [...base, 'https://example.test/cover.webp', 1000, 20000, JSON.stringify(fields)])
  const before = (await rpc('empresa_workspace')).actividad.length
  await save()
  const workspace = await rpc('empresa_workspace')
  preview = await rpc('empresa_perfil_vista_previa')
  for (const view of [workspace, preview]) {
    const e = view.empresa
    check(e.titulo === data.titulo && e.telefono_contacto === data.telefono && e.email_contacto === 'contacto@empresa.test', 'Título y contacto corporativo persisten al recargar')
    check(e.tarifa_hora === 48.5 && e.anos_experiencia === 12 && e.tiempo_respuesta === '12 horas' && e.disponible === false, 'Tarifa, experiencia, respuesta y disponibilidad persisten')
    check(JSON.stringify(e.habilidades) === JSON.stringify(data.habilidades) && e.certificaciones[0] === data.certificaciones[0] && e.idiomas[1] === 'Euskera', 'Habilidades, certificaciones e idiomas se guardan completos y ordenados')
    check(e.ubicacion === 'Bizkaia' && e.provincias.join(',') === 'Madrid,Bizkaia', 'Ubicación de cabecera independiente de la cobertura')
    check(e.presupuesto_min_interes === 1000 && e.foto_portada.endsWith('cover.webp'), 'La edición conserva portada y preferencias privadas')
  }
  check(workspace.actividad.length === before + 1, 'Perfil profesional registra solo un evento de edición')
  await asRole()
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company])
  await asRole('anon')
  const publico = await rpc('empresa_perfil_publico', [company])
  const directorio = (await rpc('empresas_publicas')).find(e => e.id === company)
  for (const e of [publico.empresa, directorio]) {
    check(e.titulo === data.titulo && e.email_contacto === 'contacto@empresa.test' && e.anos_experiencia === 12, 'Perfil y directorio públicos reciben los campos profesionales de empresa')
    check(!('email' in e) && !('telefono' in e) && !('presupuesto_min_interes' in e) && !('presupuesto_max_interes' in e), 'No hay correo personal, teléfono de registro ni preferencias privadas en público')
    check(e.proyectos_completados === 0, 'Contador de proyectos viene de contratos, no inventa actividad')
  }
  check(!JSON.stringify(publico).includes('professional-owner@example.test') && !JSON.stringify(publico).includes('666111222'), 'La presentación pública no filtra datos de registro del responsable')
  await expectError(() => save(), /permission denied/, 'Anónimo no edita campos profesionales')
  await asRole('authenticated', actors.reader); await expectError(() => save(), /No tienes permiso/, 'Lector sin permiso de perfil no edita')
  await asRole('authenticated', actors.other); await expectError(() => save(), /No tienes permiso/, 'Ajeno no edita')
  await asRole('authenticated', actors.editor)
  await save({ titulo: 'Título de editor' })
  check((await rpc('empresa_perfil_vista_previa')).empresa.email_contacto === 'contacto@empresa.test', 'Parche parcial preserva campos ausentes')
  const invalid = [null, [], { inesperado: 'x' }, { titulo: null }, { titulo: 'x'.repeat(161) }, { telefono: 123 }, { emailContacto: 'inválido' }, { tarifaHora: -1 }, { tarifaHora: 100001 }, { tarifaHora: '50' }, { anosExperiencia: -1 }, { anosExperiencia: 101 }, { anosExperiencia: 1.5 }, { disponible: 'false' }, { habilidades: [null] }, { certificaciones: Array(101).fill('x') }, { idiomas: [''] }, { idiomas: ['x\nsecreto'] }]
  for (const fields of invalid) await expectError(() => save(fields), /Revisa|correo/, `RPC rechaza datos inválidos ${JSON.stringify(fields)}`)
  check((await rpc('empresa_perfil_vista_previa')).empresa.titulo === 'Título de editor', 'Validación fallida no cambia el perfil')
  await rpc('empresa_editar_perfil_cobertura', base)
  check((await rpc('empresa_perfil_vista_previa')).empresa.tarifa_hora === 48.5, 'Clientes antiguos mantienen campos profesionales')
  await save({ tarifaHora: null, habilidades: [], certificaciones: [], idiomas: [], emailContacto: '', telefono: '' })
  const cleared = (await rpc('empresa_perfil_vista_previa')).empresa
  check(cleared.tarifa_hora === null && cleared.habilidades.length === 0 && cleared.email_contacto === null && cleared.telefono_contacto === null, 'Borrado explícito de campos opcionales persiste')
  await asRole('authenticated', actors.owner)
  await rpc('empresa_actualizar_miembro', [actors.editor, null, true, null, null, null])
  await asRole('authenticated', actors.editor); await expectError(() => save(), /No tienes permiso/, 'Revocación corta edición profesional con sesión existente')
  await asRole()
  const signature = 'public.empresa_editar_perfil_profesional(text,text,text,text,text,text[],text[],text,numeric,numeric,jsonb,boolean,boolean)'
  check(!(await one('select prosecdef from pg_proc where oid=$1::regprocedure', [signature])).prosecdef, 'Endpoint profesional público es security invoker')
  for (const role of ['anon', 'service_role']) check(!(await one("select has_function_privilege($1,$2,'execute') permitido", [role, signature])).permitido, 'Solo authenticated ejecuta edición profesional')
}
