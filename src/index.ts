import React, { useEffect, useRef, useState } from 'react'
import { JsonServer } from './server'
import {
  applySettings,
  publicSettings,
  readSettings,
  rotateToken as rotateStoredToken,
  SETTINGS_DESCRIPTOR,
  SETTINGS_KEY,
} from './settings'
import type {
  PluginHost,
  PublicSettings,
  ServerSettings,
  ServerStatus,
  SettingsPatch,
} from './types'

export * from './projection'
export * from './settings'
export * from './types'

export const pluginMetadata = {
  id: 'poi-plugin-server',
  name: 'Read-only Server',
  version: '0.2.0',
  settings: SETTINGS_DESCRIPTOR,
} as const

interface PoiWindow {
  getStore(path?: string): unknown
  config: {
    get(path: string): unknown
    set(path: string, value: unknown): void | Promise<void>
    on?(event: string, listener: (path: string, value: unknown) => void): void
    removeListener?(event: string, listener: (path: string, value: unknown) => void): void
  }
}

function hostFromPoiWindow(): PluginHost {
  const hostWindow = (globalThis as unknown as { window?: PoiWindow }).window
  if (!hostWindow || typeof hostWindow.getStore !== 'function' || !hostWindow.config) {
    throw new Error('poi host APIs window.getStore and window.config are required.')
  }
  let previousState = hostWindow.getStore()
  const listeners = new Set<() => void>()
  const poll = (): void => {
    const nextState = hostWindow.getStore()
    if (nextState === previousState) return
    previousState = nextState
    for (const listener of listeners) listener()
  }
  let timer: ReturnType<typeof setInterval> | null = null
  return {
    store: {
      getState: () => hostWindow.getStore(),
      subscribe: (listener) => {
        listeners.add(listener)
        timer ??= setInterval(poll, 100)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0 && timer !== null) {
            clearInterval(timer)
            timer = null
          }
        }
      },
    },
    config: hostWindow.config,
  }
}

export class PoiPluginServer {
  readonly id = pluginMetadata.id
  readonly name = pluginMetadata.name
  private host: PluginHost | null = null
  private settings: ServerSettings | null = null
  private server: JsonServer | null = null
  private configListener: ((path: string, value: unknown) => void) | null = null
  private ignoringConfigEvent = false

  constructor(host?: PluginHost) {
    this.host = host ?? null
  }

  async load(host?: PluginHost): Promise<void> {
    if (host) this.host = host
    if (!this.host) throw new Error('poi plugin host context is required.')
    if (this.server) await this.unload()
    this.settings = await readSettings(this.host)
    this.server = new JsonServer(this.host, this.settings)
    this.listenForSettings()
    await this.server.start()
  }

  async unload(): Promise<void> {
    if (this.host && this.configListener) {
      this.host.config.removeListener?.('config.set', this.configListener)
      this.configListener = null
    }
    await this.server?.close()
    this.server = null
    this.settings = null
  }

  getStatus(): ServerStatus {
    return (
      this.server?.status ?? {
        phase: this.settings?.enabled ? 'stopped' : 'disabled',
        configuredPort: this.settings?.port ?? 0,
        boundPort: null,
        address: null,
        error: null,
        revision: 0,
      }
    )
  }

  getSettings(): PublicSettings {
    if (!this.settings) throw new Error('poi plugin server is not loaded.')
    return publicSettings(this.settings)
  }

  async updateSettings(patch: SettingsPatch): Promise<PublicSettings> {
    if (!this.host || !this.settings || !this.server)
      throw new Error('poi plugin server is not loaded.')
    this.ignoringConfigEvent = true
    try {
      this.settings = await applySettings(this.host, this.settings, patch)
    } finally {
      this.ignoringConfigEvent = false
    }
    await this.server.reconfigure(this.settings)
    return publicSettings(this.settings)
  }

  async rotateToken(): Promise<string> {
    if (!this.host || !this.settings || !this.server)
      throw new Error('poi plugin server is not loaded.')
    this.ignoringConfigEvent = true
    try {
      this.settings = await rotateStoredToken(this.host, this.settings)
    } finally {
      this.ignoringConfigEvent = false
    }
    await this.server.reconfigure(this.settings)
    return this.settings.token
  }

  private listenForSettings(): void {
    if (!this.host?.config.on) return
    this.configListener = (path: string, value: unknown): void => {
      if (this.ignoringConfigEvent || path !== SETTINGS_KEY || !this.host || !this.server) return
      if (typeof value !== 'object' || value === null) return
      void readSettings(this.host).then((next) => {
        this.settings = next
        return this.server?.reconfigure(next)
      })
    }
    this.host.config.on('config.set', this.configListener)
  }
}

export function createPlugin(host: PluginHost): PoiPluginServer {
  return new PoiPluginServer(host)
}

const runtime = new PoiPluginServer()

/** poi calls this with zero arguments and does not await it. */
export function pluginDidLoad(): void {
  void Promise.resolve()
    .then(() => runtime.load(hostFromPoiWindow()))
    .catch(() => undefined)
}

/** poi calls this with zero arguments and does not await it. */
export function pluginWillUnload(): void {
  void runtime.unload()
}

export const settingsClass: React.FC = () => {
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [port, setPort] = useState(String(8765))
  const [token, setToken] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const draftDirty = useRef(false)

  useEffect(() => {
    let active = true
    const refresh = (): void => {
      if (!active) return
      try {
        const nextSettings = runtime.getSettings()
        if (!draftDirty.current) {
          setSettings(nextSettings)
          setPort(String(nextSettings.port))
        }
        setStatus(runtime.getStatus())
      } catch {
        setMessage('The server is not loaded yet.')
      }
    }
    refresh()
    const timer = setInterval(refresh, 500)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  if (!settings) {
    return React.createElement(
      'section',
      null,
      React.createElement('p', null, message || 'Loading server settings…'),
    )
  }

  const save = (): void => {
    const parsedPort = Number(port)
    void runtime
      .updateSettings({ enabled: settings.enabled, allowLan: settings.allowLan, port: parsedPort })
      .then((next) => {
        draftDirty.current = false
        setSettings(next)
        setStatus(runtime.getStatus())
        setMessage('Settings saved.')
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Unable to save settings.'),
      )
  }

  const rotate = (): void => {
    void runtime
      .rotateToken()
      .then((nextToken) => {
        setToken(nextToken)
        if (!draftDirty.current) setSettings(runtime.getSettings())
        setStatus(runtime.getStatus())
        setMessage(
          'Token rotated. Store this token in your trusted client now; it is not shown again.',
        )
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Unable to rotate token.'),
      )
  }

  return React.createElement(
    'section',
    { 'aria-label': 'poi read-only server settings' },
    React.createElement('h2', null, 'Read-only JSON server'),
    React.createElement(
      'label',
      null,
      React.createElement('input', {
        type: 'checkbox',
        checked: settings.enabled,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          draftDirty.current = true
          setSettings((current) =>
            current ? { ...current, enabled: event.target.checked } : current,
          )
        },
      }),
      ' Enable server',
    ),
    React.createElement(
      'p',
      null,
      React.createElement(
        'label',
        null,
        'Port ',
        React.createElement('input', {
          type: 'number',
          min: 1,
          max: 65535,
          value: port,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            draftDirty.current = true
            setPort(event.target.value)
          },
        }),
      ),
    ),
    React.createElement(
      'label',
      null,
      React.createElement('input', {
        type: 'checkbox',
        checked: settings.allowLan,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
          draftDirty.current = true
          setSettings((current) =>
            current ? { ...current, allowLan: event.target.checked } : current,
          )
        },
      }),
      ' Allow LAN access',
    ),
    React.createElement(
      'p',
      null,
      'LAN access binds all interfaces and still requires the bearer token. Use a trusted TLS tunnel on untrusted networks.',
    ),
    React.createElement('button', { type: 'button', onClick: save }, 'Save settings'),
    ' ',
    React.createElement('button', { type: 'button', onClick: rotate }, 'Generate / rotate token'),
    token
      ? React.createElement(
          'p',
          null,
          React.createElement('strong', null, 'New token (shown once): '),
          React.createElement('code', null, token),
        )
      : null,
    React.createElement(
      'p',
      null,
      `Status: ${status?.phase ?? 'unknown'}${status?.error ? ` — ${status.error}` : ''}`,
    ),
    message ? React.createElement('p', { role: 'status' }, message) : null,
    React.createElement(
      'p',
      null,
      'Endpoint: ',
      React.createElement('code', null, '/api/v1'),
      '; use ',
      React.createElement('code', null, 'Authorization: Bearer …'),
      ', never a URL credential.',
    ),
  )
}

export default PoiPluginServer
