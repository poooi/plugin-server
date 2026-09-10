import { randomBytes } from 'node:crypto'
import type {
  PluginHost,
  PublicSettings,
  ServerSettings,
  SettingsDescriptor,
  SettingsPatch,
} from './types'

export const SETTINGS_ROOT = 'plugin.poi-plugin-server'
export const SETTINGS_KEY = `${SETTINGS_ROOT}.settings`
export const DEFAULT_PORT = 8765

export const SETTINGS_DESCRIPTOR: readonly SettingsDescriptor[] = [
  {
    key: 'enabled',
    label: 'Enable server',
    description: 'Start the authenticated read-only JSON server when poi loads.',
  },
  {
    key: 'port',
    label: 'Port',
    description: `TCP port (default ${DEFAULT_PORT}) used on loopback or LAN.`,
  },
  {
    key: 'allowLan',
    label: 'Allow LAN access',
    description: 'Explicitly bind all interfaces; bearer authentication remains required.',
  },
  {
    key: 'token',
    label: 'Access token',
    description: 'Generate or rotate a bearer token. Never put it in a URL.',
  },
]

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function defaultSettings(): ServerSettings {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    allowLan: false,
    token: generateToken(),
    tokenRotatedAt: new Date().toISOString(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535
}

function readSaved(value: unknown): Partial<ServerSettings> {
  if (!isRecord(value)) return {}
  const result: Partial<ServerSettings> = {}
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled
  if (validPort(value.port)) result.port = value.port
  if (typeof value.allowLan === 'boolean') result.allowLan = value.allowLan
  if (typeof value.token === 'string' && value.token.length >= 32) result.token = value.token
  if (typeof value.tokenRotatedAt === 'string') result.tokenRotatedAt = value.tokenRotatedAt
  return result
}

export async function readSettings(host: PluginHost): Promise<ServerSettings> {
  const saved = readSaved(host.config.get(SETTINGS_KEY))
  const settings = { ...defaultSettings(), ...saved }
  if (!saved.token) await persistSettings(host, settings)
  return settings
}

export async function persistSettings(host: PluginHost, settings: ServerSettings): Promise<void> {
  await host.config.set(SETTINGS_KEY, settings)
}

export function publicSettings(settings: ServerSettings): PublicSettings {
  return {
    enabled: settings.enabled,
    port: settings.port,
    allowLan: settings.allowLan,
    tokenConfigured: settings.token.length >= 32,
    tokenRotatedAt: settings.tokenRotatedAt,
  }
}

export async function applySettings(
  host: PluginHost,
  current: ServerSettings,
  patch: SettingsPatch,
): Promise<ServerSettings> {
  if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') {
    throw new Error('Enabled must be a boolean.')
  }
  if (patch.allowLan !== undefined && typeof patch.allowLan !== 'boolean') {
    throw new Error('LAN access must be a boolean.')
  }
  if (patch.port !== undefined && !validPort(patch.port)) {
    throw new Error('Port must be an integer from 1 to 65535.')
  }
  const next = {
    ...current,
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.port === undefined ? {} : { port: patch.port }),
    ...(patch.allowLan === undefined ? {} : { allowLan: patch.allowLan }),
  }
  await persistSettings(host, next)
  return next
}

export async function rotateToken(
  host: PluginHost,
  current: ServerSettings,
): Promise<ServerSettings> {
  const next = { ...current, token: generateToken(), tokenRotatedAt: new Date().toISOString() }
  await persistSettings(host, next)
  return next
}
