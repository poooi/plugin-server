import { DATASET_NAMES, type DatasetName, type DatasetSnapshot, type JsonValue } from './types'

type PlainRecord = Record<string, unknown>

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scalar(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value) && value.every((item) => scalar(item) !== undefined)) {
    return value.map((item) => scalar(item) as JsonValue)
  }
  return undefined
}

function atPath(root: PlainRecord, path: readonly string[]): unknown {
  let current: unknown = root
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function collection(value: unknown): Array<[string, unknown]> | undefined {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item])
  if (isRecord(value)) return Object.entries(value)
  return undefined
}

const aliases: Record<DatasetName, readonly [string, readonly string[]][]> = {
  ships: [
    ['id', ['id', 'shipId', 'ship_id', 'apiId', 'api_id']],
    ['name', ['name', 'shipName', 'api_name']],
    ['type', ['type', 'typeId', 'type_id', 'api_stype']],
    ['level', ['level', 'lv', 'api_lv']],
    ['hp', ['hp', 'nowHp', 'api_nowhp']],
    ['maxHp', ['maxHp', 'max_hp', 'api_maxhp']],
    ['fuel', ['fuel', 'api_fuel']],
    ['maxFuel', ['maxFuel', 'max_fuel', 'api_fuel_max']],
    ['ammo', ['ammo', 'api_bull']],
    ['maxAmmo', ['maxAmmo', 'max_ammo', 'api_bull_max']],
    ['condition', ['condition', 'cond', 'api_cond']],
    ['equipmentIds', ['equipmentIds', 'equipment_ids', 'api_slot']],
    ['fleetId', ['fleetId', 'fleet_id']],
  ],
  equipment: [
    ['id', ['id', 'equipmentId', 'equipment_id', 'apiId', 'api_id']],
    ['name', ['name', 'equipmentName', 'api_name']],
    ['type', ['type', 'typeId', 'type_id', 'api_type']],
    ['level', ['level', 'lv', 'api_level']],
    ['rarity', ['rarity', 'api_rare']],
    ['icon', ['icon', 'api_type']],
  ],
  fleets: [
    ['id', ['id', 'fleetId', 'fleet_id', 'deckId', 'deck_id', 'api_id']],
    ['name', ['name', 'fleetName', 'api_name']],
    ['ships', ['ships', 'shipIds', 'ship_ids', 'api_ship']],
    ['flagshipId', ['flagshipId', 'flagship_id']],
  ],
  resources: [
    ['id', ['id', 'resourceId', 'resource_id', 'apiId', 'api_id']],
    ['name', ['name', 'resourceName']],
    ['type', ['type', 'typeId', 'type_id']],
    ['count', ['count', 'amount', 'value', 'api_value']],
    ['maxAmount', ['maxAmount', 'max_amount']],
  ],
  docks: [
    ['id', ['id', 'dockId', 'dock_id', 'slot', 'api_id']],
    ['kind', ['kind', 'type']],
    ['shipId', ['shipId', 'ship_id', 'api_ship_id']],
    ['state', ['state', 'status', 'api_state']],
    [
      'completeTime',
      ['completeTime', 'complete_time', 'finishTime', 'finish_time', 'api_complete_time'],
    ],
  ],
  masterData: [
    ['id', ['id', 'apiId', 'api_id', 'typeId', 'type_id']],
    ['name', ['name', 'displayName', 'display_name', 'api_name']],
    ['type', ['type', 'api_type_name']],
    ['typeId', ['typeId', 'type_id', 'api_type', 'api_stype']],
    ['category', ['category', 'kind']],
  ],
}

function projectItem(
  dataset: DatasetName,
  key: string,
  value: unknown,
): { [key: string]: JsonValue } {
  const result: { [key: string]: JsonValue } = {}
  if (isRecord(value)) {
    for (const [outputKey, possibleKeys] of aliases[dataset]) {
      for (const possibleKey of possibleKeys) {
        const selected = scalar(value[possibleKey])
        if (selected !== undefined) {
          result[outputKey] = selected
          break
        }
      }
    }
  }
  if (result.id === undefined) result.id = key
  return result
}

function resolveSimple(
  dataset: Exclude<DatasetName, 'docks' | 'masterData'>,
  root: PlainRecord,
): unknown {
  const paths: Record<
    Exclude<DatasetName, 'docks' | 'masterData'>,
    readonly (readonly string[])[]
  > = {
    ships: [['ships'], ['ship'], ['info', 'ships'], ['info', 'ship']],
    equipment: [
      ['equipment'],
      ['equipments'],
      ['info', 'equipment'],
      ['info', 'equips'],
      ['info', 'equipments'],
    ],
    fleets: [['fleets'], ['fleet'], ['decks'], ['deck'], ['info', 'fleets']],
    resources: [['resources'], ['resource'], ['materials'], ['info', 'resources']],
  }
  for (const path of paths[dataset]) {
    const value = atPath(root, path)
    if (value !== undefined) return value
  }
  return undefined
}

function resolveDocks(root: PlainRecord): Array<[string, unknown]> | undefined {
  const info = atPath(root, ['info'])
  const repairs = isRecord(info) ? info.repairs : undefined
  const constructions = isRecord(info) ? info.constructions : undefined
  const direct = atPath(root, ['docks']) ?? atPath(root, ['dock'])
  if (direct !== undefined) return collection(direct)
  const result: Array<[string, unknown]> = []
  let sourcePresent = false
  for (const [kind, value] of [
    ['repair', repairs],
    ['construction', constructions],
  ] as const) {
    sourcePresent ||= value !== undefined
    for (const [key, item] of collection(value) ?? []) {
      result.push([`${kind}-${key}`, isRecord(item) ? { ...item, kind } : { kind }])
    }
  }
  return sourcePresent ? result : undefined
}

function resolveMaster(root: PlainRecord): Array<[string, unknown]> | undefined {
  const direct = atPath(root, ['masterData']) ?? atPath(root, ['master'])
  if (direct !== undefined) return collection(direct)
  const constant = atPath(root, ['const'])
  if (!isRecord(constant)) return undefined
  const result: Array<[string, unknown]> = []
  let sourcePresent = false
  const groups = [
    ['$ships', 'ship'],
    ['$shipTypes', 'shipType'],
    ['$equips', 'equipment'],
    ['$equipTypes', 'equipmentType'],
  ] as const
  for (const [key, kind] of groups) {
    sourcePresent ||= constant[key] !== undefined
    for (const [id, item] of collection(constant[key]) ?? []) {
      result.push([
        `${kind}-${id}`,
        isRecord(item) ? { ...item, category: kind } : { category: kind },
      ])
    }
  }
  return sourcePresent ? result : undefined
}

function resolve(dataset: DatasetName, root: PlainRecord): Array<[string, unknown]> | undefined {
  if (dataset === 'docks') return resolveDocks(root)
  if (dataset === 'masterData') return resolveMaster(root)
  const entries = collection(resolveSimple(dataset, root))
  if (dataset !== 'resources' || !entries) return entries
  const names = [
    'Fuel',
    'Ammo',
    'Steel',
    'Bauxite',
    'Instant construction',
    'Fast repair',
    'Development material',
    'Improvement material',
  ]
  return entries.map(([key, value]) => {
    if (typeof value === 'number') {
      return [
        key,
        {
          id: Number(key) + 1,
          name: names[Number(key)] ?? `Resource ${Number(key) + 1}`,
          count: value,
        },
      ]
    }
    return [key, value]
  })
}

export function snapshotFor(dataset: DatasetName, state: unknown): DatasetSnapshot {
  const root = isRecord(state) ? state : {}
  const entries = resolve(dataset, root)
  return {
    schemaVersion: 1,
    dataset,
    available: entries !== undefined,
    partial: entries === undefined,
    items: entries?.map(([key, value]) => projectItem(dataset, key, value)) ?? [],
  }
}

export function allSnapshots(state: unknown): Record<DatasetName, DatasetSnapshot> {
  return Object.fromEntries(
    DATASET_NAMES.map((dataset) => [dataset, snapshotFor(dataset, state)]),
  ) as Record<DatasetName, DatasetSnapshot>
}
