// Genuine GoTrue expiry in the isolated short-session fixture, no forged JWT.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {localFixture} from './local-client-fixtures.mjs';
const f=await localFixture('eur');
const batch=JSON.parse(fs.readFileSync(f.dir+'/empresa-retirada-eur-fixtures.json'));
try {
  const actor=await f.client('AD',[]);
  const session=(await actor.supabase.auth.getSession()).data.session;
  const remaining=session.expires_at-Math.floor(Date.now()/1000);
  assert.ok(remaining>0&&remaining<=180,'Short-lived genuine Auth token');
  const issuedAt=new Date().toISOString();
  // Allow clock-skew tolerance in the real JWT verifier before asserting expiry.
  console.log({issuedAt,expiresAt:new Date(session.expires_at*1000).toISOString(),waitSeconds:remaining+65});
  await new Promise(resolve=>setTimeout(resolve,(remaining+65)*1000));
  const checks=[];
  for(const co of batch.companies) {
    const before=(await f.db.query('select count(*)::int n from diime_private.empresa_verificaciones where empresa_id=$1',[co.id])).rows[0].n;
    const response=await fetch(f.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/empresa_retirar_verificacion',{method:'POST',headers:{apikey:f.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_empresa_id:co.id,p_verificacion_id:co.verificationId,p_motivo:'Intento con sesión genuinamente caducada'})});
    const result=await response.json();
    fs.writeFileSync(f.dir+'/empresa-retirada-expired-last-response.json',JSON.stringify({at:new Date().toISOString(),side:co.side,status:response.status,result},null,2));
    assert.equal(response.status,401);assert.match(result.message,/expired/i);
    const after=(await f.db.query('select count(*)::int n from diime_private.empresa_verificaciones where empresa_id=$1',[co.id])).rows[0].n;
    assert.equal(after,before);
    checks.push({side:co.side,status:response.status,error:result.message,unchanged:true});
  }
  fs.writeFileSync(f.dir+'/empresa-retirada-expired-session.json',JSON.stringify({at:new Date().toISOString(),issuedAt,expiresAt:new Date(session.expires_at*1000).toISOString(),genuineGoTrueToken:true,checks},null,2));
  console.log({expiredSessionChecks:checks.length,passed:true});
} finally {
  await f.db.end();
  execFileSync(process.execPath,['scripts/e2e/local-auth-short-session.mjs','--restore'],{stdio:'inherit'});
}
