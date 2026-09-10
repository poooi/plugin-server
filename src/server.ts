import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { allSnapshots, snapshotFor } from './projection'
import {
  DATASET_NAMES,
  type DatasetName,
  type PluginHost,
  type ServerSettings,
  type ServerStatus,
} from './types'

const MAX_URL_LENGTH = 2048
const MAX_CONTENT_LENGTH = 8192

function isDataset(value: string): value is DatasetName {
  return (DATASET_NAMES as readonly string[]).includes(value)
}

function parseHost(value: string): { hostname: string; port: number | null } | null {
  if (value.length > 255 || value.includes('@') || /\s/.test(value)) return null
  try {
    const parsed = new URL(`http://${value}`)
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      return null
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const port = parsed.port === '' ? null : Number(parsed.port)
    if (!hostname || (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)))
      return null
    return { hostname, port }
  } catch {
    return null
  }
}

function approvedHost(
  host: string | undefined,
  settings: ServerSettings,
): { hostname: string; port: number | null } | null {
  if (!host) return null
  const parts = parseHost(host)
  if (!parts) return null
  const local =
    parts.hostname === 'localhost' ||
    (isIP(parts.hostname) === 4 && parts.hostname.startsWith('127.')) ||
    parts.hostname === '::1'
  const lan = settings.allowLan && isIP(parts.hostname) !== 0
  if (!local && !lan) return null
  if (parts.port !== null && parts.port !== settings.port) return null
  return parts
}

function approvedOrigin(
  origin: string | undefined,
  host: { hostname: string; port: number | null },
  settings: ServerSettings,
): boolean {
  if (origin === undefined) return true
  if (origin === 'null') return false
  try {
    const parsed = new URL(origin)
    if (
      parsed.protocol !== 'http:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      return false
    const originHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const originPort = parsed.port === '' ? 80 : Number(parsed.port)
    const requestPort = host.port ?? settings.port
    return originHost === host.hostname && originPort === requestPort
  } catch {
    return false
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  const payload = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(payload))
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Connection', 'close')
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  }
  response.end(payload)
}

function authMatches(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return false
  const supplied = header.slice('Bearer '.length)
  const expected = Buffer.from(token)
  const actual = Buffer.from(supplied)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export class JsonServer {
  private server: Server | null = null
  private unsubscribe: (() => void) | null = null
  private lifecycle: Promise<void> = Promise.resolve()
  private revision = 0
  private _status: ServerStatus

  constructor(
    private readonly host: PluginHost,
    private settings: ServerSettings,
  ) {
    this._status = {
      phase: settings.enabled ? 'stopped' : 'disabled',
      configuredPort: settings.port,
      boundPort: null,
      address: null,
      error: null,
      revision: 0,
    }
    this.unsubscribe = host.store.subscribe(() => {
      this.revision += 1
      this._status.revision = this.revision
    })
  }

  get status(): ServerStatus {
    return { ...this._status }
  }

  async start(): Promise<void> {
    return this.enqueue(() => this.startNow())
  }

  async reconfigure(settings: ServerSettings): Promise<void> {
    return this.enqueue(async () => {
      const listenerChanged =
        this.settings.enabled !== settings.enabled ||
        this.settings.port !== settings.port ||
        this.settings.allowLan !== settings.allowLan
      this.settings = settings
      this._status = { ...this._status, configuredPort: settings.port }
      if (!listenerChanged && this.server && this._status.phase === 'running') return
      await this.stopNow()
      await this.startNow()
    })
  }

  async close(): Promise<void> {
    return this.enqueue(async () => {
      await this.stopNow()
      this.unsubscribe?.()
      this.unsubscribe = null
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.lifecycle.then(operation, operation)
    this.lifecycle = result.catch(() => undefined)
    return result
  }

  private async startNow(): Promise<void> {
    if (!this.settings.enabled) {
      this._status = { ...this._status, phase: 'disabled', configuredPort: this.settings.port }
      return
    }
    if (this.server) await this.stopNow()
    this._status = {
      ...this._status,
      phase: 'starting',
      configuredPort: this.settings.port,
      boundPort: null,
      address: null,
      error: null,
    }
    const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) =>
      this.handle(request, response),
    )
    server.maxHeadersCount = 64
    server.on('error', (error: NodeJS.ErrnoException) => {
      this._status = {
        ...this._status,
        phase: 'error',
        error:
          error.code === 'EADDRINUSE'
            ? `Port ${this.settings.port} is already in use.`
            : error.message,
        boundPort: null,
        address: null,
      }
    })
    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        server.off('error', onError)
        const address = server.address()
        const boundPort = typeof address === 'object' && address ? address.port : this.settings.port
        const bindAddress = this.settings.allowLan ? '0.0.0.0' : '127.0.0.1'
        this.server = server
        this._status = {
          ...this._status,
          phase: 'running',
          boundPort,
          address: `${bindAddress}:${boundPort}`,
          error: null,
        }
        resolve()
      }
      const onError = (error: Error): void => {
        server.off('listening', onListening)
        reject(error)
      }
      server.once('listening', onListening)
      server.once('error', onError)
      server.listen(this.settings.port, this.settings.allowLan ? '0.0.0.0' : '127.0.0.1')
    }).catch((error: unknown) => {
      if (this._status.phase !== 'error')
        this._status = {
          ...this._status,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Unable to start server.',
        }
      server.close()
    })
  }

  private async stopNow(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    this._status = {
      ...this._status,
      phase: this.settings.enabled ? 'stopped' : 'disabled',
      boundPort: null,
      address: null,
    }
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    if (!request.url || request.url.length > MAX_URL_LENGTH) {
      sendJson(response, 414, { error: 'request_too_large' })
      return
    }
    const host = approvedHost(request.headers.host, this.settings)
    if (!host || !approvedOrigin(request.headers.origin, host, this.settings)) {
      sendJson(response, 403, { error: 'untrusted_host' })
      return
    }
    const origin = request.headers.origin
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        response.setHeader('Access-Control-Allow-Headers', 'Authorization')
        response.setHeader('Access-Control-Max-Age', '300')
        response.setHeader('Vary', 'Origin')
      }
      response.end()
      return
    }
    if (!authMatches(request, this.settings.token)) {
      response.setHeader('WWW-Authenticate', 'Bearer')
      sendJson(response, 401, { error: 'unauthorized' }, origin)
      return
    }
    const contentLengthHeader = request.headers['content-length']
    const contentLength = contentLengthHeader === undefined ? 0 : Number(contentLengthHeader)
    if (
      (contentLengthHeader !== undefined &&
        (!/^\d+$/.test(contentLengthHeader) || !Number.isSafeInteger(contentLength))) ||
      contentLength > MAX_CONTENT_LENGTH ||
      request.headers['transfer-encoding'] !== undefined
    ) {
      sendJson(response, 413, { error: 'request_too_large' }, origin)
      return
    }
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' }, origin)
      return
    }
    let parsedUrl: URL
    try {
      parsedUrl = new URL(request.url, 'http://localhost')
    } catch {
      sendJson(response, 400, { error: 'invalid_request' }, origin)
      return
    }
    if (
      ['token', 'access_token', 'authorization', 'auth'].some((key) =>
        parsedUrl.searchParams.has(key),
      )
    ) {
      sendJson(response, 400, { error: 'token_in_url_not_allowed' }, origin)
      return
    }
    const segments = parsedUrl.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'api' || segments[1] !== 'v1') {
      sendJson(response, 404, { error: 'not_found' }, origin)
      return
    }
    if (segments.length === 2) {
      sendJson(response, 200, { schemaVersion: 1, datasets: DATASET_NAMES }, origin)
      return
    }
    if (segments.length === 3 && segments[2] === 'snapshot') {
      sendJson(
        response,
        200,
        {
          schemaVersion: 1,
          revision: this.revision,
          datasets: allSnapshots(this.host.store.getState()),
        },
        origin,
      )
      return
    }
    const datasetSegment = segments[3]
    if (
      segments.length === 4 &&
      (segments[2] === 'data' || segments[2] === 'datasets') &&
      datasetSegment !== undefined &&
      isDataset(datasetSegment)
    ) {
      sendJson(response, 200, snapshotFor(datasetSegment, this.host.store.getState()), origin)
      return
    }
    sendJson(response, 404, { error: 'not_found' }, origin)
  }
}
