import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { actionClient, requireLoopback } from './http-action-client.mjs'

export async function hitosContext() {
  const dir = path.resolve(process.env.DIIME_HITOS_QA_DIR || '.build/hitos-stripe-test-20261114')
  const env = parseEnv(fs.readFileSync(path.join(dir, '.env.supabase-local'), 'utf8'))
  const stripeEnv = parseEnv(fs.readFileSync(path.join(dir, '.env.stripe-test.local'), 'utf8'))
  const credentials = JSON.parse(fs.readFileSync(path.join(dir, 'local-credentials.json'), 'utf8'))
  const baseUrl = process.env.DIIME_HITOS_QA_URL || 'http://127.0.0.1:3214'
  requireLoopback(baseUrl); requireLoopback(env.NEXT_PUBLIC_SUPABASE_URL)
  const key = stripeEnv.DIIME_STRIPE_SECRET_KEY || stripeEnv.STRIPE_SECRET_KEY
  assert.match(key || '', /^[sr]k_test_/)
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 })
  const [balance, account] = await Promise.all([stripe.balance.retrieve(), stripe.accounts.retrieve()])
  assert.equal(balance.livemode, false); assert.equal(account.id, 'acct_1USOyz3B6hPi56bO')
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const clients = new Map()
  async function client(alias) {
    if (clients.has(alias)) return clients.get(alias)
    const user = credentials.users[alias]
    const c = actionClient({ baseUrl, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ...(process.env.DIIME_HITOS_ACTION_MANIFEST ? { manifestPath: process.env.DIIME_HITOS_ACTION_MANIFEST } : {}) })
    assert.equal(await c.login(user.email, user.password), user.id)
    clients.set(alias, c); return c
  }
  async function call(alias, name, args, route = '/mis-solicitudes') {
    const c = await client(alias)
    const response = await c.request(route)
    if (response.status >= 400) throw Error(`Route ${route} returned ${response.status}`)
    await response.text()
    return (await c.call(name, args, { route })).value
  }
  function ok(value, label) { assert.ok(!value?.error, `${label}: ${value?.error}`); return value?.data ?? value }
  async function row(table, id) { const r = await admin.from(table).select('*').eq('id', id).single(); if (r.error) throw r.error; return r.data }
  return { dir, env, baseUrl, credentials, stripe, admin, client, call, ok, row }
}
