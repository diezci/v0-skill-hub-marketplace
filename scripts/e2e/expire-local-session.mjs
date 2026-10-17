// Invalidate refresh credentials of one explicit synthetic actor only. Let the
// real Auth SDK observe renewal rejection and close the UI; never edit cookies.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pagosContext} from './pagos-context.mjs'
const c=pagosContext(),alias=process.argv[2]
assert.ok(['CP','CE_TITULAR','CE_ADMIN','CE_MIEMBRO'].includes(alias))
const state=JSON.parse(fs.readFileSync(c.dir+'/auth-short-session-state.json'))
assert.ok(!state.restoredAt,'Short-session local Auth must be active')
assert.ok(['127.0.0.1','localhost'].includes(new URL(c.env.DATABASE_URL).hostname))
const {Client}=createRequire(path.resolve('.build/workflow-db/package.json'))('pg')
const db=new Client({connectionString:c.env.DATABASE_URL});await db.connect()
try{
  const userId=c.credentials.users[alias].id
  const r=await db.query('update auth.refresh_tokens set revoked=true where user_id=$1 and revoked=false returning id',[userId])
  const s=await db.query('select id,created_at,updated_at from auth.sessions where user_id=$1 order by created_at desc limit 1',[userId])
  const proof={at:new Date().toISOString(),actor:alias,userId,scope:'Local synthetic Auth only; refresh revoked, no browser session mutation',revoked:r.rowCount,latestSession:s.rows[0]}
  fs.appendFileSync(c.dir+'/T010-expiry-'+alias+'.jsonl',JSON.stringify(proof)+'\n')
  console.log(proof)
}finally{await db.end()}
