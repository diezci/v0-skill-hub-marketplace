// Real HTTP -> Next server action -> real local Supabase. This is API evidence,
// not a replacement for the browser steps in the workflow matrix.
import fs from 'node:fs'
import path from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { encodeReply } from 'next/dist/compiled/react-server-dom-webpack/client.node.js'
import { decodeActionResponse } from './flight-action-response.mjs'

export function requireLoopback(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('E2E_REQUIRES_LOCAL_HTTP')
  }
  return url
}

export function actionClient({ baseUrl = 'http://127.0.0.1:3200', supabaseUrl, anonKey, manifestPath, root = process.cwd() }) {
  requireLoopback(baseUrl)
  requireLoopback(supabaseUrl)
  const jar = new Map()
  const supabase = createServerClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: entries => entries.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)),
    },
  })
  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user || !data.session) throw new Error('E2E_SESSION_MISSING')
    return data.user.id
  }
  function manifest() {
    const runtime = path.join(root, '.build/e2e-20261014/app-runtime.json')
    const production = fs.existsSync(runtime) && JSON.parse(fs.readFileSync(runtime, 'utf8')).mode === 'start'
    const file = manifestPath ?? (production ? ['.next/server/server-reference-manifest.json'] : ['.next/dev/server/server-reference-manifest.json', '.next/server/server-reference-manifest.json'])
      .map(file => path.join(root, file)).find(file => fs.existsSync(file))
    if (!file) throw new Error('START_NEXT_AND_LOAD_THE_ACTION_PAGE_FIRST')
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  async function request(route, init = {}) {
    const target = new URL(route, baseUrl)
    if (target.origin !== new URL(baseUrl).origin) throw new Error('E2E_CROSS_ORIGIN_REQUEST_REJECTED')
    const response = await fetch(target, {
      ...init, redirect: 'manual',
      headers: { Cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join('; '), ...init.headers },
    })
    for (const header of response.headers.getSetCookie()) {
      const first = header.split(';', 1)[0], index = first.indexOf('=')
      if (index < 0) continue
      const name = first.slice(0, index), value = first.slice(index + 1)
      if (value) jar.set(name, value); else jar.delete(name)
    }
    return response
  }
  async function call(name, args = [], { route = '/', filename } = {}) {
    const candidates = Object.entries(manifest().node).filter(([, entry]) =>
      entry.exportedName === name && (!filename || entry.filename === filename))
    if (candidates.length !== 1) throw new Error(`ACTION_NOT_UNIQUE_OR_NOT_COMPILED: ${name} (${candidates.length})`)
    const body = await encodeReply(args)
    const response = await request(route, {
      method: 'POST',
      headers: { 'Next-Action': candidates[0][0], ...(typeof body === 'string' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : {}), Accept: 'text/x-component', Origin: baseUrl },
      body,
    })
    const text = await response.text()
    const redirect = response.headers.get('x-action-redirect')
    if (!response.ok) throw new Error(`ACTION_HTTP_FAILED: ${name}; status=${response.status}`)
    const value = redirect ? undefined : decodeActionResponse(text)
    return { value, status: response.status, redirect }
  }
  return { supabase, login, request, call, logout: () => supabase.auth.signOut() }
}
