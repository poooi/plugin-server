export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type Unsubscribe = () => void

export interface PoiStore {
  getState(): unknown
  subscribe(listener: () => void): Unsubscribe
}

export interface PoiConfig {
  get(path: string): unknown
  set(path: string, value: unknown): void | Promise<void>
  on?(event: string, listener: (path: string, value: unknown) => void): void
  removeListener?(event: string, listener: (path: string, value: unknown) => void): void
}

export interface PluginHost {
  store: PoiStore
  config: PoiConfig
}

export interface ServerSettings {
  enabled: boolean
  port: number
  allowLan: boolean
  token: string
  tokenRotatedAt: string
}

export interface PublicSettings {
  enabled: boolean
  port: number
  allowLan: boolean
  tokenConfigured: boolean
  tokenRotatedAt: string
}

export type ServerPhase = 'disabled' | 'starting' | 'running' | 'error' | 'stopped'

export interface ServerStatus {
  phase: ServerPhase
  configuredPort: number
  boundPort: number | null
  address: string | null
  error: string | null
  revision: number
}

export const DATASET_NAMES = [
  'ships',
  'equipment',
  'fleets',
  'resources',
  'docks',
  'masterData',
] as const

export type DatasetName = (typeof DATASET_NAMES)[number]

export interface DatasetSnapshot {
  schemaVersion: 1
  dataset: DatasetName
  available: boolean
  partial: boolean
  items: Array<{ [key: string]: JsonValue }>
}

export interface SettingsPatch {
  enabled?: boolean
  port?: number
  allowLan?: boolean
}

export interface SettingsDescriptor {
  key: keyof SettingsPatch | 'token'
  label: string
  description: string
}
