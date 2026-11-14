// Loopback TLS for private-file integration tests. Trust this CA only in the test process
// with NODE_EXTRA_CA_CERTS; do not alter OS/browser trust or disable certificate validation.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { execFileSync } from 'node:child_process'

const mode = process.argv[2]
if (!['--prepare', '--serve'].includes(mode)) throw Error('Use --prepare or --serve')
const directory = path.resolve(process.env.DIIME_HITOS_QA_DIR || '.build/hitos-stripe-test-20261114', 'tls')
fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
const ca = path.join(directory, 'ca-cert.pem'), key = path.join(directory, 'server-key.pem'), cert = path.join(directory, 'server-cert.pem')
if (mode === '--prepare') {
  if (!fs.existsSync(cert)) {
    const run = args => execFileSync('/usr/bin/openssl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const caKey = path.join(directory, 'ca-key.pem'), csr = path.join(directory, 'server.csr'), extensions = path.join(directory, 'extensions.cnf')
    fs.writeFileSync(extensions, 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n')
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=Diime Local Milestone QA CA', '-keyout', caKey, '-out', ca])
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', key, '-out', csr])
    run(['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey, '-CAcreateserial', '-days', '2', '-extfile', extensions, '-out', cert])
    fs.chmodSync(key, 0o600); fs.chmodSync(caKey, 0o600)
  }
  console.log(JSON.stringify({ ca, cert, origin: 'https://127.0.0.1:3216', trust: 'NODE_EXTRA_CA_CERTS for the test process only' }))
} else {
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (request, response) => {
    const upstream = http.request({ hostname: '127.0.0.1', port: 3214, path: request.url, method: request.method,
      headers: { ...request.headers, host: '127.0.0.1:3216', 'x-forwarded-host': '127.0.0.1:3216', 'x-forwarded-proto': 'https' } }, result => {
      response.writeHead(result.statusCode || 502, result.headers); result.pipe(response)
    })
    upstream.on('error', () => { response.writeHead(502); response.end('Local QA upstream unavailable') })
    request.pipe(upstream)
  })
  server.listen(3216, '127.0.0.1', () => console.log(JSON.stringify({ localTls: true, origin: 'https://127.0.0.1:3216', upstream: 'http://127.0.0.1:3214' })))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
}
