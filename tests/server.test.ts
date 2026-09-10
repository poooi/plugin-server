import { request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPlugin,
  defaultSettings,
  pluginDidLoad,
  pluginWillUnload,
  publicSettings,
  settingsClass,
  snapshotFor,
  type PluginHost,
} from '../dist/index.js'

class Store {
  state: unknown
  private listeners = new Set<() => void>()

  constructor(state: unknown) {
    this.state = state
  }

  getState(): unknown {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(state: unknown): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

class Config {
  private values = new Map<string, unknown>()
  private listeners = new Set<(path: string, value: unknown) => void>()

  get(path: string): unknown {
    return this.values.get(path)
  }

  set(path: string, value: unknown): void {
    this.values.set(path, value)
    for (const listener of this.listeners) listener(path, value)
  }

  on(event: string, listener: (path: string, value: unknown) => void): void {
    if (event === 'config.set') this.listeners.add(listener)
  }

  removeListener(event: string, listener: (path: string, value: unknown) => void): void {
    if (event === 'config.set') this.listeners.delete(listener)
  }
}

const plugins: Array<Awaited<ReturnType<typeof createPlugin>>> = []

afterEach(async () => {
  for (const plugin of plugins.splice(0)) await plugin.unload()
})

async function freePort(): Promise<number> {
  const server = createNetServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('unable to reserve a port')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

function fixture(): { state: unknown; store: Store; config: Config; host: PluginHost } {
  const store = new Store({
    info: {
      ships: {
        '1': {
          api_id: 1,
          api_ship_id: 1,
          api_lv: 12,
          api_nowhp: 18,
          secret: 'private',
        },
      },
      equips: { '2': { api_id: 2, api_slotitem_id: 2, api_locked: 0, api_level: 3 } },
      fleets: [{ api_id: 1, api_name: 'First Fleet', api_ship: [1], api_flagship: '0' }],
      resources: [321, 123],
      repairs: [{ api_id: 1, api_ship_id: 1, api_state: 1 }],
      constructions: [{ api_id: 1, api_created_ship_id: 2, api_state: 2 }],
    },
    const: {
      $shipTypes: { '1': { api_id: 1, api_name: 'Destroyer' } },
      $ships: { '1': { api_id: 1, api_name: 'Fubuki', api_stype: 1 } },
      $equips: { '2': { api_id: 2, api_name: 'Gun', api_type: [1, 2, 3], api_rare: 4 } },
    },
  })
  const config = new Config()
  const host = { store, config }
  return { state: store.state, store, config, host }
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function makePlugin() {
  const { store, config, host } = fixture()
  const port = await freePort()
  config.set('plugin.poi-plugin-server.settings', { enabled: true, port, allowLan: false })
  const plugin = createPlugin(host)
  await plugin.load()
  plugins.push(plugin)
  const saved = config.get('plugin.poi-plugin-server.settings')
  if (
    typeof saved !== 'object' ||
    saved === null ||
    !('token' in saved) ||
    typeof saved.token !== 'string'
  )
    throw new Error('token was not persisted')
  return { plugin, store, config, token: saved.token, port }
}

async function request(
  port: number,
  path: string,
  token: string | undefined,
  headers: Record<string, string> = {},
) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        headers: {
          Host: `127.0.0.1:${port}`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      },
      (response) => {
        let payload = ''
        response.setEncoding('utf8')
        response.on('data', (chunk: string) => {
          payload += chunk
        })
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(payload) as Record<string, unknown>,
            })
          } catch (error: unknown) {
            reject(error instanceof Error ? error : new Error('Unable to parse HTTP response.'))
          }
        })
      },
    )
    request.on('error', reject)
    request.end()
  })
}

describe('built poi plugin entry over real loopback HTTP', () => {
  it('exercises the real zero-argument unawaited poi lifecycle hooks', async () => {
    const { store, config } = fixture()
    const port = await freePort()
    config.set('plugin.poi-plugin-server.settings', { enabled: true, port, allowLan: false })
    ;(globalThis as unknown as { window?: unknown }).window = {
      getStore: () => store.getState(),
      config,
    }
    expect(pluginDidLoad.length).toBe(0)
    expect(pluginWillUnload.length).toBe(0)
    pluginDidLoad()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const saved = config.get('plugin.poi-plugin-server.settings')
    expect(
      typeof saved === 'object' &&
        saved !== null &&
        'token' in saved &&
        typeof saved.token === 'string',
    ).toBe(true)
    store.update({})
    await wait(150)
    const lifecycleToken =
      typeof saved === 'object' && saved !== null && 'token' in saved ? saved.token : undefined
    expect(
      typeof lifecycleToken === 'string'
        ? (await request(port, '/api/v1/snapshot', lifecycleToken)).body.revision
        : -1,
    ).toBe(1)
    pluginWillUnload()
    await wait(20)
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('loads, discovers allowlisted data, follows live state, and unloads', async () => {
    const { plugin, store, token, port } = await makePlugin()
    expect((await request(port, '/api/v1', token)).body.datasets).toEqual([
      'ships',
      'equipment',
      'fleets',
      'resources',
      'docks',
      'masterData',
    ])
    const ships = await request(port, '/api/v1/data/ships', token)
    expect(ships.status).toBe(200)
    expect(ships.body.items).toEqual([
      { id: 1, shipId: 1, name: 'Fubuki', type: 1, level: 12, hp: 18 },
    ])
    expect(ships.body).not.toHaveProperty('secret')
    expect((await request(port, '/api/v1/data/equipment', token)).body.items).toEqual([
      { id: 2, slotitemId: 2, name: 'Gun', type: [1, 2, 3], level: 3, rarity: 4 },
    ])
    expect((await request(port, '/api/v1/data/fleets', token)).body.items).toEqual([
      { id: 1, name: 'First Fleet', ships: [1], flagshipId: '0' },
    ])
    expect((await request(port, '/api/v1/data/docks', token)).body.items).toEqual([
      { id: 1, kind: 'repair', shipId: 1, state: 1 },
      { id: 1, kind: 'construction', shipId: 2, state: 2 },
    ])
    store.update({ ships: [{ id: 1, name: 'Fubuki', level: 13 }] })
    expect((await request(port, '/api/v1/data/ships', token)).body.items).toEqual([
      { id: 1, name: 'Fubuki', level: 13 },
    ])
    expect(plugin.getStatus().revision).toBe(1)
    await plugin.unload()
    await expect(request(port, '/api/v1', token)).rejects.toThrow()
  })

  it('rejects missing/wrong auth, URL credentials, untrusted Host and Origin', async () => {
    const { token, port } = await makePlugin()
    expect((await request(port, '/api/v1', undefined)).status).toBe(401)
    expect((await request(port, '/api/v1', 'wrong-token')).status).toBe(401)
    expect((await request(port, `/api/v1?token=${token}`, undefined)).status).toBe(401)
    expect((await request(port, `/api/v1?token=${token}`, token)).status).toBe(400)
    expect((await request(port, `/api/v1?access_token=${token}`, token)).status).toBe(400)
    expect((await request(port, '/api/v1', token, { Host: 'attacker.example' })).status).toBe(403)
    expect(
      (await request(port, '/api/v1', token, { Origin: `http://attacker.example:${port}` })).status,
    ).toBe(403)
  })

  it('rotates credentials, rebinds settings, and responds to config changes', async () => {
    const { plugin, config, token, port } = await makePlugin()
    const newToken = await plugin.rotateToken()
    expect(newToken).not.toBe(token)
    expect((await request(port, '/api/v1', token)).status).toBe(401)
    expect((await request(port, '/api/v1', newToken)).status).toBe(200)
    const nextPort = await freePort()
    await plugin.updateSettings({ port: nextPort })
    expect(plugin.getStatus().boundPort).toBe(nextPort)
    config.set('plugin.poi-plugin-server.settings', {
      enabled: false,
      port: nextPort,
      allowLan: false,
      token: newToken,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(plugin.getStatus().phase).toBe('disabled')
    await expect(plugin.updateSettings({ port: 0 })).rejects.toThrow('Port')
  })

  it('handles partial state, reload, disable/re-enable, and occupied ports', async () => {
    const first = await makePlugin()
    const occupiedPort = first.port
    const secondConfig = new Config()
    secondConfig.set('plugin.poi-plugin-server.settings', {
      enabled: true,
      port: occupiedPort,
      allowLan: false,
    })
    const second = createPlugin({ store: new Store({}), config: secondConfig })
    await second.load()
    plugins.push(second)
    expect(second.getStatus().phase).toBe('error')
    expect(second.getStatus().error).toContain('already in use')
    first.store.update({})
    const partial = await request(first.port, '/api/v1/data/resources', first.token)
    expect(partial.body).toMatchObject({ available: false, partial: true, items: [] })
    await first.plugin.updateSettings({ enabled: false })
    await first.plugin.updateSettings({ enabled: true })
    expect(first.plugin.getStatus().phase).toBe('running')
    await first.plugin.unload()
    await first.plugin.load()
    expect(first.plugin.getStatus().phase).toBe('running')
  })
})

describe('built projection and settings entry', () => {
  it('keeps secrets out of allowlisted projection and maps real poi slices', () => {
    expect(
      snapshotFor('ships', {
        info: { ships: { '7': { api_id: 7, api_ship_id: 17, api_lv: 4, token: 'private' } } },
        const: { $ships: { '17': { api_id: 17, api_name: 'Mutsuki', api_stype: 2 } } },
      }),
    ).toEqual({
      schemaVersion: 1,
      dataset: 'ships',
      available: true,
      partial: false,
      items: [{ id: 7, shipId: 17, name: 'Mutsuki', type: 2, level: 4 }],
    })
    expect(
      snapshotFor('masterData', {
        const: { $shipTypes: { '1': { api_id: 1, api_name: 'Destroyer' } } },
      }).items,
    ).toEqual([{ id: 1, name: 'Destroyer', category: 'shipType' }])
  })

  it('generates high-entropy defaults without exposing the token in public settings', () => {
    const settings = defaultSettings()
    expect(settings.token).toHaveLength(43)
    expect(publicSettings(settings)).not.toHaveProperty('token')
  })

  it('renders settings and keeps edits stable until the user saves them', async () => {
    const { store, config } = fixture()
    const port = await freePort()
    let nextPort = await freePort()
    while (nextPort === port) nextPort = await freePort()
    config.set('plugin.poi-plugin-server.settings', { enabled: false, port, allowLan: false })
    ;(globalThis as unknown as { window?: unknown }).window = {
      getStore: () => store.getState(),
      config,
    }
    pluginDidLoad()
    await wait(20)

    let renderer: ReturnType<typeof create> | undefined
    await act(async () => {
      renderer = create(createElement(settingsClass))
      await wait(0)
    })
    if (!renderer) throw new Error('settings renderer was not created')
    const inputs = (): Array<{ props: Record<string, unknown> }> =>
      renderer?.root.findAllByType('input') ?? []
    const buttons = (): Array<{ props: Record<string, unknown> }> =>
      renderer?.root.findAllByType('button') ?? []
    const [enabledInput, portInput, allowLanInput] = inputs()
    if (!enabledInput || !portInput || !allowLanInput) throw new Error('settings inputs missing')

    await act(async () => {
      ;(enabledInput.props.onChange as (event: { target: { checked: boolean } }) => void)({
        target: { checked: true },
      })
      ;(portInput.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: String(nextPort) },
      })
      ;(allowLanInput.props.onChange as (event: { target: { checked: boolean } }) => void)({
        target: { checked: true },
      })
      await wait(650)
    })
    expect(inputs()[0]?.props.checked).toBe(true)
    expect(inputs()[1]?.props.value).toBe(String(nextPort))
    expect(inputs()[2]?.props.checked).toBe(true)

    const saveButton = buttons()[0]
    if (!saveButton) throw new Error('save button missing')
    await act(async () => {
      ;(saveButton.props.onClick as () => void)()
      await wait(20)
    })
    expect(config.get('plugin.poi-plugin-server.settings')).toMatchObject({
      enabled: true,
      port: nextPort,
      allowLan: true,
    })
    renderer.unmount()
    pluginWillUnload()
    await wait(20)
    delete (globalThis as unknown as { window?: unknown }).window
  })

  it('accepts the exact loopback headers used by the documented TLS proxy', async () => {
    const { token, port } = await makePlugin()
    expect(
      (
        await request(port, '/api/v1', token, {
          Host: `127.0.0.1:${port}`,
          Origin: `http://127.0.0.1:${port}`,
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request(port, '/api/v1', token, {
          Host: `127.0.0.1:${port}`,
          Origin: `https://localhost`,
        })
      ).status,
    ).toBe(403)
  })
})
