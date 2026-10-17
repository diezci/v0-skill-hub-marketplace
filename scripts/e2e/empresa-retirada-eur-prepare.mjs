import fs from 'node:fs';import assert from 'node:assert/strict';import{parseEnv}from'node:util';import Stripe from 'stripe';
import{pagosContext}from'./pagos-context.mjs';import{localFixture}from'./local-client-fixtures.mjs';
const c=pagosContext('eur'),f=await localFixture('eur'),env=parseEnv(fs.readFileSync(c.dir+'/.env.stripe-test.local','utf8'));assert.ok(env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
const stripe=new Stripe(env.STRIPE_SECRET_KEY);assert.equal((await stripe.balance.retrieve()).livemode,false);assert.equal((await stripe.accounts.retrieve()).default_currency,'eur');
const file=c.dir+'/empresa-retirada-eur-fixtures.json',data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{at:new Date().toISOString(),companies:[],jobs:[]};const save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
try {
 for(const [side,alias]of[['cliente','CE_TITULAR'],['proveedor','PE_TITULAR']]) {
  const id=f.m.companies[side].id;assert.equal((await c.row('empresas',id)).estado_verificacion,'verificada');
  let v=(await f.db.query('select id,estado from diime_private.empresa_verificaciones where empresa_id=$1 order by creada_at desc limit 1',[id])).rows[0];
  if(!v)v=(await f.db.query("insert into diime_private.empresa_verificaciones(empresa_id,estado,metodo,representante_nombre,cargo_legal,responsable_usuario_id,documento_nombre,documento,nota_revision,revisada_por,revisada_at) values($1,'verificada','documental','Representante EUR QA','Responsable ficticio',$2,'acreditacion-eur-qa.pdf',convert_to('%PDF-1.7 Documento ficticio para QA','UTF8'),'Precondicion sintetica de empresa verificada',$3,now()) returning id,estado",[id,f.m.users[alias].id,f.m.users.AD.id])).rows[0];
  assert.equal(v.estado,'verificada');if(!data.companies.some(co=>co.id===id)){data.companies.push({side,alias,id,verificationId:v.id});save();}
 }
 for(const [side,ca,pa]of[['cliente','CE_TITULAR','PP'],['proveedor','CP','PE_TITULAR']]) {
  const kind='retirada_'+side;let j=data.jobs.find(x=>x.kind===kind);
  if(!j){j={kind,...await c.createJob({ca,pa,label:'EUR '+kind})};j.expectedDestination=pa==='PP'?'acct_1UQRzq3s2wL7Aw2y':'acct_1UQSUwKTJ1adPoG5';data.jobs.push(j);save();}
  if(!j.sessionId){const actor=await c.client(ca),route='/pago/'+j.trabajoId;await actor.request(route);const r=(await actor.call('crearPagoEscrow',[{trabajo_id:j.trabajoId}],{route})).value;c.ok(r,'crearPagoEscrow');j.sessionId=r.escrow.stripe_session_id;j.escrowId=r.escrow.id;j.url='http://localhost:3200'+route;save();}
  const session=await stripe.checkout.sessions.retrieve(j.sessionId);assert.equal(session.livemode,false);assert.equal(session.amount_total,11000);assert.equal(session.currency,'eur');console.log({kind,job:j.trabajoId,url:j.url,payment:session.payment_status});
 }
} finally {await f.db.end();}
