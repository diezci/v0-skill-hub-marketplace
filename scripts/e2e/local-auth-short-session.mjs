// Isolated GoTrue fixture for actual token expiry, without changing production
// settings or forging browser cookies. Restore the original container afterwards.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const dir=path.resolve('.build/e2e-20261014'),bin=path.join(dir,'tools/docker/docker')
const context='colima-diime-e2e-20261014',original='supabase_auth_diime-e2e-20261014',temporary='diime-e2e-auth-short-session'
const docker=(...args)=>execFileSync(bin,['--context',context,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
const journal=path.join(dir,'auth-short-session-state.json'),envFile=path.join(dir,'.env.auth-short-session')
if(process.argv.includes('--restore')){
  if(fs.existsSync(journal)){
    try{docker('stop',temporary);docker('rm',temporary)}catch{}
    docker('start',original)
    const record=JSON.parse(fs.readFileSync(journal));record.restoredAt=new Date().toISOString();fs.writeFileSync(journal,JSON.stringify(record,null,2))
    fs.rmSync(envFile,{force:true})
    console.log('Original local Auth restored; temporary credentials file removed')
  }
}else{
  if(fs.existsSync(journal)&&!JSON.parse(fs.readFileSync(journal)).restoredAt)throw Error('Already active; restore before another run')
  const spec=JSON.parse(docker('inspect',original))[0]
  assert.equal(spec.Config.Image,'public.ecr.aws/supabase/gotrue:v2.197.0');assert.equal(spec.Mounts.length,0)
  const networks=Object.keys(spec.NetworkSettings.Networks);assert.deepEqual(networks,['diime-e2e-loopback-20261014'])
  const env=spec.Config.Env.map(line=>line.startsWith('GOTRUE_JWT_EXP=')?'GOTRUE_JWT_EXP=180':line)
  assert.ok(env.every(line=>!line.includes('\n')))
  fs.writeFileSync(envFile,env.join('\n')+'\n',{mode:0o600})
  docker('create','--name',temporary,'--network',networks[0],'--network-alias',original,'--env-file',envFile,spec.Config.Image,...spec.Config.Cmd)
  fs.writeFileSync(journal,JSON.stringify({startedAt:new Date().toISOString(),original,temporary,context,expirySeconds:180,precondition:'Local Auth issues short JWTs; original stateless container preserved for exact restoration'},null,2))
  docker('stop',original)
  try{docker('start',temporary);console.log('Local Auth short-session fixture started (180 seconds)')}
  catch(error){docker('start',original);throw error}
}
