// Starts the real app with a deliberately isolated environment. No production
// .env is loaded by this launcher; explicit empty values prevent Next's dotenv
// fallback from enabling external delivery or production public uploads.
// Optional Blob credentials must belong to the dedicated, unconnected QA store.
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { spawn } from 'node:child_process'
import { requireLoopback } from './http-action-client.mjs'

const root = process.cwd()
const mode = process.argv[2] || 'dev'
if (!['dev', 'build', 'start'].includes(mode)) throw new Error('Use dev, build or start')
const dir = path.join(root, '.build/e2e-20261014')
const local = parseEnv(fs.readFileSync(path.join(dir, '.env.supabase-local'), 'utf8'))
const stripe = parseEnv(fs.readFileSync(path.join(dir, '.env.stripe-test.local'), 'utf8'))
requireLoopback(local.NEXT_PUBLIC_SUPABASE_URL)
requireLoopback(local.NEXT_PUBLIC_SITE_URL)
if (!stripe.DIIME_STRIPE_SECRET_KEY?.startsWith('sk_test_') || stripe.DIIME_STRIPE_SECRET_KEY !== stripe.STRIPE_SECRET_KEY) {
  throw new Error('E2E_REQUIRES_MATCHING_STRIPE_TEST_KEYS')
}
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: mode === 'dev' ? 'development' : 'production', NEXT_TELEMETRY_DISABLED: '1', DIIME_EMPRESAS_LOCAL: '0',
  DIIME_E2E_LOCAL: '1', NODE_OPTIONS: '--max-old-space-size=2048',
  BLOB_READ_WRITE_TOKEN: '', FIREBASE_SERVICE_ACCOUNT_JSON: '', APNS_PRIVATE_KEY: '',
  APNS_KEY_ID: '', APNS_TEAM_ID: '', APNS_BUNDLE_ID: '', VERCEL_OIDC_TOKEN: '', VERCEL_URL: '',
  STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: '', NEXT_PUBLIC_APPLE_LOGIN: 'false',
  RESEND_API_KEY: 're_local_e2e_only', RESEND_BASE_URL: 'http://127.0.0.1:3321',
  RESEND_FROM: 'Diime QA <avisos@diime.test>', OPERATIONS_ALERT_EMAIL: 'e2e-ad-20261014@diime.test',
}
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SITE_URL']) {
  if (!local[name]) throw new Error(`MISSING_LOCAL_ENV: ${name}`)
  env[name] = local[name]
}
for (const name of ['STRIPE_SECRET_KEY', 'DIIME_STRIPE_SECRET_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_DIIME_STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'DIIME_STRIPE_WEBHOOK_SECRET']) {
  if (!stripe[name]) throw new Error(`MISSING_TEST_ENV: ${name}`)
  env[name] = stripe[name]
}
// Never inherit the production Blob token. The optional QA credential is
// bound to the store we created specifically for this isolated run.
const blobEnvPath = path.join(dir, '.env.blob-test.local')
if (fs.existsSync(blobEnvPath)) {
  const blobEnv = parseEnv(fs.readFileSync(blobEnvPath, 'utf8'))
  const blobStore = JSON.parse(fs.readFileSync(path.join(dir, '.blob-test-store-api-private.json'), 'utf8')).store
  if (blobStore.name !== 'diime-e2e-20261014-public-images'
    || blobStore.id !== blobEnv.DIIME_E2E_BLOB_STORE_ID
    || blobStore.ownerId !== 'team_onuAQ4w7GJ7Z4wAboRfbriGQ'
    || blobStore.totalConnectedProjects !== 0
    || !blobEnv.BLOB_READ_WRITE_TOKEN?.toLowerCase().startsWith(`vercel_blob_rw_${blobStore.id.slice(6).toLowerCase()}_`)) {
    throw new Error('E2E_REQUIRES_DEDICATED_UNCONNECTED_BLOB_STORE')
  }
  env.BLOB_READ_WRITE_TOKEN = blobEnv.BLOB_READ_WRITE_TOKEN
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, ...(mode === 'build' ? [] : ['--hostname', '127.0.0.1', '--port', '3200'])], { cwd: root, env, stdio: 'inherit' })
if (mode !== 'build') fs.writeFileSync(path.join(dir, 'app-runtime.json'), JSON.stringify({ mode, startedAt: new Date().toISOString(), pid: child.pid, host: '127.0.0.1', port: 3200 }))
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
child.on('exit', code => { process.exitCode = code ?? 1 })
