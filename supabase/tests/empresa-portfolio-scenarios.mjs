// Synthetic company portfolios; no production data or notifications.
export async function prepararPortfolioEmpresaLegacy({ db, asRole, rpc }) {
  const actors = Object.fromEntries(['owner', 'editor', 'reader', 'other'].map((name, i) => [name, `71000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]))
  await asRole()
  // The compact historical workflow fixture omits the category lookup table.
  await db.exec('create table if not exists public.categorias(id uuid primary key default gen_random_uuid(),nombre text not null)')
  for (const [name, id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `portfolio-${name}@example.test`])
    await db.query('insert into public.profiles(id,email,nombre) values($1,$2,$3)', [id, `portfolio-${name}@example.test`, name])
    await db.query('insert into public.profesionales(id,titulo) values($1,$2)', [id, name])
  }
  await asRole('authenticated', actors.owner)
  const company = await rpc('vincular_mi_empresa', [null, 'Empresa portfolio', 'B71000001', 'DOC', 'Dirección', null, 'Madrid'])
  for (const name of ['editor', 'reader']) {
    const invitation = await rpc('empresa_crear_invitacion', [`portfolio-${name}@example.test`, 'Cargo', 'miembro', JSON.stringify({ perfil: name === 'editor' }), false])
    await asRole('authenticated', actors[name]); await rpc('empresa_aceptar_invitacion', [invitation.token]); await asRole('authenticated', actors.owner)
  }
  await asRole('authenticated', actors.other)
  const otherCompany = await rpc('vincular_mi_empresa', [null, 'Otra empresa portfolio', 'B71000002', 'DOC', 'Dirección', null, 'Madrid'])
  await asRole()
  // Seed historical contracts independently of the booking/payment workflow;
  // the actual tests leave all triggers enabled and compare exact snapshots.
  await db.exec('set session_replication_role=replica')
  const request = (await db.query("insert into public.solicitudes(cliente_id,titulo,descripcion,ubicacion) values($1,'Demanda original','Descripción publicada por el cliente','Madrid') returning id", [actors.other])).rows[0].id
  const works = {}
  for (const [name, companyId, status] of [['completed', company, 'completado'], ['pending', company, 'pendiente'], ['other', otherCompany, 'completado'], ['personal', null, 'completado']]) {
    works[name] = (await db.query("insert into public.trabajos(solicitud_id,cliente_id,profesional_id,titulo,descripcion,precio_acordado,estado,empresa_proveedora_id,fecha_fin) values($1,$2,$3,'Contrato original','Descripción del contrato',1234.56,$4,$5,'2026-10-01') returning id", [request, actors.other, actors.owner, status, companyId])).rows[0].id
  }
  const legacy = (await db.query("insert into public.portfolio(profesional_id,trabajo_id,titulo,descripcion,imagenes,presupuesto,contexto_proveedor) values($1,$2,'Proyecto heredado','Descripción heredada',array['https://example.test/legacy.webp'],1234.56,'Contexto del proveedor') returning id", [actors.owner, works.completed])).rows[0].id
  const hidden = (await db.query("insert into public.portfolio(profesional_id,trabajo_id,titulo,descripcion,visible) values($1,$2,'Proyecto oculto','No publicar',false) returning id", [actors.owner, works.pending])).rows[0].id
  await db.exec('set session_replication_role=origin')
  return { actors, company, otherCompany, works, legacy, hidden,
    contracts: JSON.stringify((await db.query('select * from public.trabajos where id=any($1::uuid[]) order by id', [Object.values(works)])).rows),
    personal: JSON.stringify((await db.query('select * from public.portfolio where id=any($1::uuid[]) order by id', [[legacy, hidden]])).rows) }
}

export async function testPortfolioEmpresa({ db, asRole, one, rpc, check, expectError, legacyPortfolio: fixture }) {
  const { actors, company, works, legacy, hidden } = fixture
  const external = { titulo: 'Proyecto externo', descripcion: 'Trabajo realizado fuera de Diime', categoria: 'Fontanería', ubicacion: 'Madrid', duracion: '2 días', imagen_url: 'https://example.test/project.webp', presupuesto: 9876.54, fecha_completado: '2026-10-20', contexto_proveedor: 'Reforma de instalación' }
  const save = (data=external, id=null) => rpc('empresa_portfolio_guardar', [JSON.stringify(data), id])
  await asRole('authenticated', actors.owner)
  let items = await rpc('empresa_portfolio')
  check(items.length === 2 && items.find(p => p.id === legacy)?.presupuesto === 1234.56, 'Migra historial con el mismo ID y presupuesto exacto para editor')
  check(items.find(p => p.id === hidden)?.visible === false, 'Conserva proyectos ocultos sin hacerlos públicos')
  check(items.find(p => p.id === hidden)?.trabajo_id === null, 'Proyecto histórico no completado no recibe distintivo verificado')
  const candidates = await rpc('empresa_trabajos_completados_portfolio')
  check(candidates.length === 1 && candidates[0].id === works.completed, 'Selector solo ofrece trabajos completados de la empresa activa')
  check(candidates[0].solicitud.titulo === 'Demanda original' && candidates[0].precio_acordado === 1234.56, 'Selector recibe demanda y precio para el mismo editor profesional')
  const added = (await save()).id
  items = await rpc('empresa_portfolio')
  const saved = items.find(p => p.id === added)
  check(saved.trabajo_id === null && saved.imagenes[0] === external.imagen_url && saved.presupuesto === 9876.54 && saved.fecha_proyecto === '2026-10-20' && saved.duracion === '2 días', 'Proyecto externo persiste imagen, fecha, duración y presupuesto')
  await save({ ...external, trabajo_id: works.completed, titulo: 'Demanda alterada', descripcion: 'Contenido alterado', ubicacion: 'Barcelona', contexto_proveedor: 'Contexto propio' }, legacy)
  const verified = (await rpc('empresa_portfolio')).find(p => p.id === legacy)
  check(verified.titulo === 'Demanda original' && verified.descripcion === 'Descripción publicada por el cliente' && verified.ubicacion === 'Madrid', 'Proyecto verificado conserva los datos originales del cliente')
  check(verified.contexto_proveedor === 'Contexto propio', 'Empresa añade contexto separado del texto de la demanda')
  for (const work of [works.pending, works.other, works.personal]) await expectError(() => save({ ...external, trabajo_id: work }), /no está disponible/, 'Rechaza trabajo pendiente, personal o de otra empresa')
  for (const presupuesto of [-1, 'NaN', 'Infinity', 100000000]) await expectError(() => save({ ...external, presupuesto }), /presupuesto/, 'Presupuesto inválido no se guarda')
  for (const payload of [null, [], 'texto', { ...external, titulo: 123 }, { ...external, descripcion: [] }, { ...external, imagen_url: {} }, { ...external, empresa_id: company }]) {
    await expectError(() => save(payload), /datos del proyecto/, 'Payload malformado se rechaza de forma controlada')
  }
  await expectError(() => save({ ...external, imagen_url: 'javascript:alert(1)' }), /imagen/, 'Rechaza imagen insegura')
  await expectError(() => save({ ...external, titulo: '  ' }), /título/, 'Proyecto externo requiere título y descripción')
  await asRole('authenticated', actors.editor)
  await save({ ...external, titulo: 'Editado por equipo' }, added)
  check((await rpc('empresa_portfolio')).find(p => p.id === added)?.titulo === 'Editado por equipo', 'Miembro con permiso de perfil puede editar el portfolio de empresa')
  for (const actor of [actors.reader, actors.other]) {
    await asRole('authenticated', actor)
    await expectError(() => save(external, added), /No tienes permiso|no está disponible/, 'Sin permiso o desde otra empresa no actualiza proyecto ajeno')
    await expectError(() => rpc('empresa_portfolio_eliminar', [added]), /No tienes permiso|no está disponible/, 'Sin permiso o desde otra empresa no elimina proyecto ajeno')
  }
  await asRole('authenticated', actors.reader)
  await expectError(() => rpc('empresa_portfolio'), /No tienes permiso/, 'Sin permiso perfil no obtiene presupuestos exactos')
  await expectError(() => rpc('empresa_trabajos_completados_portfolio'), /No tienes permiso/, 'Sin permiso perfil no enumera trabajos privados')
  await asRole('authenticated', actors.other)
  check((await rpc('empresa_portfolio')).length === 0, 'Editor de otra empresa no obtiene proyectos ajenos')
  for (const role of ['anon', 'service_role']) {
    await asRole(role)
    for (const name of ['empresa_portfolio', 'empresa_trabajos_completados_portfolio']) await expectError(() => rpc(name), /permission denied/, 'RPC privado no disponible para rol no autorizado')
    await expectError(() => save(), /permission denied/, 'Anónimo y service_role no crean proyectos por endpoint privado')
  }
  await asRole('authenticated', actors.owner)
  await expectError(() => db.query('select * from diime_private.empresa_portfolio'), /permission denied/, 'Tabla privada no expone importes por consulta directa')
  await expectError(() => db.query('select diime_private.empresa_portfolio_publico($1)', [company]), /permission denied/, 'Helper no permite saltarse publicación de empresas verificadas')
  await asRole()
  const publicRows = (await one('select diime_private.empresa_portfolio_publico($1) as items', [company])).items
  check(publicRows.length === 2 && !publicRows.some(p => p.id === hidden), 'Proyección pública excluye proyectos ocultos')
  check(publicRows.every(p => !Object.hasOwn(p, 'presupuesto')) && publicRows.find(p => p.id === added)?.rango_precio === '5.000–10.000 €', 'Proyección pública solo revela el rango aproximado')
  check(publicRows.find(p => p.id === added)?.duracion === '2 días' && publicRows.find(p => p.id === added)?.contexto_proveedor === external.contexto_proveedor, 'Campos completos del editor llegan a la proyección pública')
  check(JSON.stringify((await db.query('select * from public.trabajos where id=any($1::uuid[]) order by id', [Object.values(works)])).rows) === fixture.contracts, 'Guardar portfolio no altera contratos históricos')
  check(JSON.stringify((await db.query('select * from public.portfolio where id=any($1::uuid[]) order by id', [[legacy, hidden]])).rows) === fixture.personal, 'Empresa no modifica el portfolio personal original')
  for (const signature of ['empresa_portfolio_guardar(jsonb,uuid)', 'empresa_portfolio_eliminar(uuid)', 'empresa_portfolio()', 'empresa_trabajos_completados_portfolio()']) {
    check(!(await one('select prosecdef from pg_proc where oid=$1::regprocedure', [`public.${signature}`])).prosecdef, 'Endpoint público usa security invoker')
  }
  check((await one("select relrowsecurity from pg_class where oid='diime_private.empresa_portfolio'::regclass")).relrowsecurity, 'Tabla privada tiene RLS como defensa adicional')
  await asRole('authenticated', actors.owner)
  await rpc('empresa_actualizar_miembro', [actors.editor, null, true, null, null, null])
  await asRole('authenticated', actors.editor)
  await expectError(() => save(external, added), /No tienes permiso/, 'Revocación corta edición con sesión antigua')
  await expectError(() => rpc('empresa_portfolio'), /No tienes permiso/, 'Revocación corta lectura privada con sesión antigua')
  await asRole('authenticated', actors.owner)
  await rpc('empresa_portfolio_eliminar', [added])
  check(!(await rpc('empresa_portfolio')).some(p => p.id === added), 'Eliminar proyecto se conserva al recargar')
  await expectError(() => rpc('empresa_portfolio_eliminar', [added]), /no está disponible/, 'Eliminar un proyecto inexistente no devuelve éxito ficticio')
  await asRole()
}

export async function testPortfolioEmpresaPublico({ db, asRole, rpc, check, legacyPortfolio: fixture }) {
  const { actors, company, legacy, hidden } = fixture
  await asRole('authenticated', actors.owner)
  const item = await rpc('empresa_portfolio_guardar', [JSON.stringify({ titulo: 'Proyecto público nuevo', descripcion: 'Realizado por nuestra empresa', presupuesto: 4321.09, imagen_url: 'https://example.test/public.webp', contexto_proveedor: 'Contexto público', duracion: '3 días' }), null])
  const preview = await rpc('empresa_perfil_vista_previa')
  check(preview.portfolio.some(p => p.id === item.id && p.rango_precio === '2.500–5.000 €'), 'Vista previa utiliza el portfolio nuevo con rango aproximado')
  check(preview.portfolio.every(p => !Object.hasOwn(p, 'presupuesto')), 'Solo la acción privada de edición devuelve el presupuesto exacto')
  await asRole('anon')
  check(await rpc('empresa_perfil_publico', [company]) === null, 'Portfolio nuevo no publica una empresa todavía en borrador')
  await asRole()
  await db.query("update public.empresas set estado_verificacion='verificada',verificada=true where id=$1", [company])
  await asRole('anon')
  const profile = await rpc('empresa_perfil_publico', [company])
  check(profile.empresa.proyectos_completados === 1, 'Estadística pública cuenta contratos completados de empresa, no proyectos externos ni contratos ajenos')
  check(profile.portfolio.some(p => p.id === item.id && p.imagen === 'https://example.test/public.webp' && p.duracion === '3 días' && p.contexto_proveedor === 'Contexto público'), 'RPC público muestra proyecto nuevo completo de la empresa')
  check(profile.portfolio.find(p => p.id === legacy)?.titulo === 'Demanda original', 'RPC público usa la edición de empresa del proyecto heredado')
  check(!profile.portfolio.some(p => p.id === hidden), 'RPC público mantiene oculto el proyecto histórico privado')
  check(profile.portfolio.every(p => !Object.hasOwn(p, 'presupuesto')) && !JSON.stringify(profile).includes('4321.09'), 'RPC público nunca filtra el precio exacto privado')
  await asRole()
}
