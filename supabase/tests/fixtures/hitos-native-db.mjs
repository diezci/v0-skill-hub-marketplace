/** Optional native Postgres adapter for the milestone SQL suites.
 * Install pinned embedded-postgres and pg in a temporary package directory,
 * then set DIIME_TEST_NODE_MODULES to that directory's node_modules.
 * Uses a new temporary local cluster; never connects to a configured project.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import os from 'node:os'
const modules = process.env.DIIME_TEST_NODE_MODULES
if (!modules) throw new Error('DIIME_TEST_NODE_MODULES must identify the isolated native test dependencies')
const { default: EmbeddedPostgres } = await import(pathToFileURL(join(modules, 'embedded-postgres/dist/index.js')).href)
export const { default: pg } = await import(pathToFileURL(join(modules, 'pg/lib/index.js')).href)
export class PGlite {
  constructor() { this.ready = this.initialize() }
  async initialize() {
    this.directory = await mkdtemp(join(os.tmpdir(), 'diime-hitos-pg-'))
    this.connectionOptions = { host: '127.0.0.1', port: 55449, database: 'postgres', user: 'postgres', password: 'hitos-local-only' }
    this.server = new EmbeddedPostgres({ databaseDir: this.directory, ...this.connectionOptions, persistent: false, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} })
    try {
      await this.server.initialise()
      await this.server.start()
      this.started = true
      this.client = new pg.Client(this.connectionOptions)
      await this.client.connect()
    } catch (error) {
      if (this.started) await this.server.stop()
      await rm(this.directory, { recursive: true, force: true })
      throw error
    }
  }
  async exec(sql) { await this.ready; return this.client.query(sql) }
  async query(sql, args) { await this.ready; return this.client.query(sql, args) }
  async close() {
    await this.ready
    if (this.closed) return
    this.closed = true
    try { await this.client.end() } finally {
      try { await this.server.stop() } finally { await rm(this.directory, { recursive: true, force: true }) }
    }
  }
}
