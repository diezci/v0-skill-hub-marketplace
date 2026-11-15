import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Runs after the legacy verification scenarios, against the upgraded PostgreSQL
// database with its real grants, RLS, fiscal triggers and workflow functions.
export async function run({ db, actor, ids, connection, pg, checks }) {
  const aliases = ['unificadaEmpresa', 'unificadaPersona', 'unificadaCarrera', 'unificadaLegacy'];
  const expedientes = {};
  for (const alias of aliases) {
    ids[alias] = randomUUID();
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [ids[alias], `${alias}@example.test`]);
    await db.query('insert into public.profiles(id,email,nombre,email_notificaciones) values($1,$2,$3,false)', [ids[alias], `${alias}@example.test`, 'Proveedor sintético']);
    await db.query('insert into public.profesionales(id,titulo,disponible) values($1,$2,false)', [ids[alias], 'Montaje y mantenimiento']);
    const documentos = [];
    for (const categoria of ['identidad', 'cualificacion', ...(alias === 'unificadaEmpresa' ? ['representacion'] : [])]) {
      const id = randomUUID(), nombre = `${categoria}.pdf`;
      await actor(null, 'select public.registrar_documento_acreditacion_profesional($1,$2,$3,$4,$5,$6,$7)',
        [id, ids[alias], categoria, `${ids[alias]}/${id}.pdf`, nombre, 100, 'a'.repeat(64)], 'service_role');
      documentos.push({ categoria, url: `acreditacion://${id}`, nombre });
    }
    expedientes[alias] = { tipoProveedor: alias === 'unificadaEmpresa' ? 'empresa' : 'particular', nombreLegal: alias === 'unificadaEmpresa' ? 'Empresa Unificada Prueba SL' : 'Persona Prueba', nif: alias === 'unificadaEmpresa' ? 'B12345678' : '12345678Z', domicilioFiscal: 'Calle Prueba 1, Madrid', actividad: 'Montaje\nMantenimiento', cualificacion: 'Experiencia documentada\nFormación pertinente para la actividad', consentimiento: true, documentos,
      ...(alias === 'unificadaEmpresa' ? { representanteNombre: 'Persona Representante', cargoRepresentacion: 'Administrador único' } : {}) };
  }
  const submit = (alias, changes = {}) => actor(alias, 'select public.solicitar_acreditacion_profesional($1,$2) as id', ['', { ...expedientes[alias], ...changes }]);
  const current = async alias => (await db.query('select s.*,p.verificado from public.solicitudes_verificacion_profesional s join public.profiles p on p.id=s.profesional_id where s.profesional_id=$1', [ids[alias]])).rows[0];
  const review = async (alias, representacion = true, version) => actor('admin', 'select public.revisar_acreditacion_profesional($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids[alias], 'verificado', '', 'Identidad, actividad y documentación contrastadas por Diime.', version || (await db.query('select actualizada_at::text v from public.solicitudes_verificacion_profesional where profesional_id=$1', [ids[alias]])).rows[0].v, true, true, representacion]);

  await db.query('update public.profiles set verificado=true where id=$1', [ids.unificadaLegacy]);
  await actor('unificadaLegacy', 'update public.profesionales set titulo=$1 where id=$2', ['Nueva actividad legacy', ids.unificadaLegacy]);
  assert.equal((await current('unificadaLegacy')).estado, 'retirada');
  assert.equal((await current('unificadaLegacy')).verificado, false);
  assert.equal((await db.query('select count(*)::int n from public.historial_verificacion_profesional where profesional_id=$1', [ids.unificadaLegacy])).rows[0].n, 1);
  await actor('unificadaPersona', 'update public.profesionales set titulo=$1 where id=$2', ['Actividad inicial completada', ids.unificadaPersona]);
  assert.equal(await current('unificadaPersona'), undefined);
  checks.push('insignia legacy sin expediente se retira y audita al cambiar actividad; borrador nuevo sigue editable');

  await assert.rejects(actor('particular', 'select public.solicitar_verificacion_profesional($1)', ['Texto antiguo']), /documentos/);
  await assert.rejects(actor('particular', 'select public.vincular_mi_empresa(null,$1,$2,$3,$4,null,null)', ['Nueva Empresa', 'B99999999', '12345678Z', 'Administrador único']), /permission denied/);
  checks.push('upgrade bloquea alta empresarial separada y acreditación de texto sin pruebas');
  await assert.rejects(submit('unificadaPersona', { documentos: expedientes.unificadaEmpresa.documentos }), /pertenece/);
  await assert.rejects(submit('unificadaPersona', { documentos: [] }), /documentos/);
  const duplicates = await Promise.all(Array.from({ length: 6 }, () => submit('unificadaEmpresa')));
  assert.equal(new Set(duplicates.map(r => r.rows[0].id)).size, 1);
  assert.equal((await db.query('select count(*)::int n from diime_private.historial_acreditacion_profesional where profesional_id=$1', [ids.unificadaEmpresa])).rows[0].n, 1);
  assert.equal((await actor('unificadaEmpresa', 'select public.mi_identidad_proveedor_cobros() as i')).rows[0].i.tipo_proveedor, 'empresa');
  await assert.rejects(review('unificadaEmpresa', false), /representación/);
  await review('unificadaEmpresa');
  assert.equal((await current('unificadaEmpresa')).verificado, true);
  assert.equal((await db.query('select empresa_id from public.profiles where id=$1', [ids.unificadaEmpresa])).rows[0].empresa_id, null);
  checks.push('empresa usa un solo perfil, documentos privados y revisión de representación; seis envíos son idempotentes');

  const metadata = 'select public.documento_acreditacion_profesional_metadata($1) as documento';
  assert.equal((await actor('unificadaPersona', metadata, [expedientes.unificadaEmpresa.documentos[0].url])).rows[0].documento, null);
  assert.ok((await actor('admin', metadata, [expedientes.unificadaEmpresa.documentos[0].url])).rows[0].documento.storage_path);
  await assert.rejects(actor('unificadaEmpresa', 'select * from diime_private.acreditaciones_profesionales'), /permission denied/);
  checks.push('dossier privado no se enumera y solo titular o administrador obtiene metadata de descarga');

  // Even a broader storage policy inherited from another feature must not
  // expose this bucket. Production access goes through short-lived server URLs.
  await db.query('grant select,insert on storage.objects to authenticated');
  await db.query('create policy fixture_storage_permisivo on storage.objects for all to authenticated using(true) with check(true)');
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['acreditaciones-profesionales', `${ids.unificadaEmpresa}/privado.pdf`]);
  assert.equal((await actor('unificadaEmpresa', 'select * from storage.objects where bucket_id=$1', ['acreditaciones-profesionales'])).rowCount, 0);
  await assert.rejects(actor('unificadaEmpresa', 'insert into storage.objects(bucket_id,name) values($1,$2)', ['acreditaciones-profesionales', 'suplantado.pdf']), /row-level security/);
  assert.equal((await db.query('select public from storage.buckets where id=$1', ['acreditaciones-profesionales'])).rows[0].public, false);
  checks.push('bucket privado deniega acceso directo incluso ante una política genérica de almacenamiento permisiva');

  // The same row lock serializes a new identity submission and registering the
  // Stripe account created from the formerly approved version.
  await submit('unificadaCarrera'); await review('unificadaCarrera');
  const blocker = new pg.Client(connection); await blocker.connect();
  let results;
  try {
    await blocker.query('begin');
    await blocker.query('select id from public.profesionales where id=$1 for update', [ids.unificadaCarrera]);
    const change = submit('unificadaCarrera', { nif: '23456789D' });
    const register = actor(null, 'select public.registrar_cuenta_stripe_proveedor($1,$2,$3,$4)', [ids.unificadaCarrera, 'acct_unifiedRace', 1, 'particular'], 'service_role');
    // Queue both transactions behind the professional row held above.
    await new Promise(resolve => setTimeout(resolve, 100));
    await blocker.query('commit');
    results = await Promise.allSettled([change, register]);
  } finally { await blocker.query('rollback'); await blocker.end(); }
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const race = (await db.query('select p.stripe_account_id,a.datos,a.version from public.profesionales p join diime_private.acreditaciones_profesionales a on a.profesional_id=p.id where p.id=$1', [ids.unificadaCarrera])).rows[0];
  if (race.stripe_account_id) { assert.equal(race.datos.nif, '12345678Z'); assert.equal(race.version, 1); }
  else { assert.equal(race.datos.nif, '23456789D'); assert.equal(race.version, 2); assert.equal((await current('unificadaCarrera')).verificado, false); }
  checks.push('carrera cambio de NIF/registro Stripe conserva una única identidad y nunca vincula versión obsoleta');

  await submit('unificadaPersona');
  const stamp = (await db.query('select actualizada_at::text v from public.solicitudes_verificacion_profesional where profesional_id=$1', [ids.unificadaPersona])).rows[0].v;
  await actor('unificadaPersona', 'update public.profesionales set certificaciones=$1 where id=$2', [JSON.stringify(['Nueva cualificación declarada']), ids.unificadaPersona]);
  await assert.rejects(review('unificadaPersona', true, stamp), /ha cambiado|retirada|solicitud/);
  assert.equal((await current('unificadaPersona')).verificado, false);
  await submit('unificadaPersona'); await review('unificadaPersona');
  await actor('unificadaPersona', 'update public.profesionales set tarifa_por_hora=45 where id=$1', [ids.unificadaPersona]);
  assert.equal((await current('unificadaPersona')).verificado, true);
  await actor('unificadaPersona', 'update public.profesionales set titulo=$1 where id=$2', ['Otra actividad', ids.unificadaPersona]);
  assert.equal((await current('unificadaPersona')).estado, 'retirada');
  assert.equal((await current('unificadaPersona')).verificado, false);
  checks.push('cambios materiales cierran expediente pendiente o aprobado; precio preserva revisión vigente');
}
