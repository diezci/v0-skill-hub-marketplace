// Test-only local transport. Does not register or change any hosted webhook endpoint.
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { spawn } from 'node:child_process'
import Stripe from 'stripe'

const mode = process.argv[2]
if (!['--prepare-secret', '--listen'].includes(mode)) throw Error('Use --prepare-secret or --listen')
const directory = path.resolve(process.env.DIIME_HITOS_QA_DIR || '.build/hitos-stripe-test-20261114')
const envPath = path.join(directory, '.env.stripe-test.local')
const env = parseEnv(fs.readFileSync(envPath, 'utf8'))
const key = env.DIIME_STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY
if (!/^[sr]k_test_/.test(key || '')) throw Error('TEST_KEY_REQUIRED')
const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 15000 })
if ((await stripe.balance.retrieve()).livemode !== false || (await stripe.accounts.retrieve()).id !== 'acct_1USOyz3B6hPi56bO') throw Error('ISOLATED_QA_SANDBOX_REQUIRED')
const url = new URL(process.env.DIIME_HITOS_QA_URL || 'http://127.0.0.1:3214')
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('LOOPBACK_ONLY')
const endpoint = new URL('/api/stripe/webhook', url).href
const cliArgs = ['--config', path.join(directory, 'stripe-cli.toml'), '--project-name', 'diime-hitos-qa', 'listen', '--skip-update',
  ...(mode === '--prepare-secret' ? ['--print-secret'] : ['--events',
    'checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,account.updated,refund.updated,refund.failed,charge.dispute.created,charge.dispute.closed',
    '--forward-to', endpoint, '--forward-connect-to', endpoint])]
const child = spawn(process.env.DIIME_HITOS_STRIPE_CLI || '/usr/local/bin/stripe', cliArgs, {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, STRIPE_API_KEY: key }, stdio: ['ignore', 'pipe', 'pipe'],
})
let pending = '', stored = false
function line(value) {
  const secret = value.match(/whsec_[A-Za-z0-9_]+/)?.[0]
  if (secret && !stored) {
    env.STRIPE_WEBHOOK_SECRET = secret; env.DIIME_STRIPE_WEBHOOK_SECRET = secret
    fs.writeFileSync(envPath, Object.entries(env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 })
    fs.chmodSync(envPath, 0o600); stored = true
    console.log(JSON.stringify({ testOnly: true, webhookSecretStored: true, endpoint }))
  }
  if (mode === '--listen') process.stdout.write(value.replace(/(?:whsec_|[sr]k_(?:test|live)_)[A-Za-z0-9_]+/g, '[REDACTED]'))
}
function output(chunk) { pending += chunk.toString(); let end; while ((end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end + 1)); pending = pending.slice(end + 1) } }
child.stdout.on('data', output); child.stderr.on('data', output)
child.on('error', error => { console.error(error.code || 'LISTENER_START_FAILED'); process.exitCode = 1 })
process.on('SIGINT', () => child.kill('SIGINT')); process.on('SIGTERM', () => child.kill('SIGTERM'))
const code = await new Promise(resolve => child.once('exit', resolve))
if (pending) line(pending)
if (code !== 0 || !stored) { console.error('STRIPE_TEST_LISTENER_FAILED'); process.exitCode = 1 }
