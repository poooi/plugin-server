# JSON API

The API is read-only and versioned at `/api/v1`.

| Request                      | Result                              |
| ---------------------------- | ----------------------------------- |
| `GET /api/v1`                | Supported dataset names             |
| `GET /api/v1/snapshot`       | Current projection of every dataset |
| `GET /api/v1/data/{dataset}` | Current projection of one dataset   |

The response for a dataset includes `available`, `partial`, and `items`. A dataset is explicitly partial until its corresponding poi state is present. Only documented scalar fields and scalar arrays are copied; Redux, config, cookies, game credentials, and arbitrary properties are never returned.

Each `items` entry is an allowlisted projection. Fields are omitted when poi has not provided a scalar value or matching master record:

| Dataset      | Fields                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ships`      | `id` (owned roster id), `shipId` (master `api_ship_id`), `name`, `type` (master ship class id), `level`, `hp`, `maxHp`, `fuel`, `maxFuel`, `ammo`, `maxAmmo`, `condition`, `equipmentIds`, `fleetId` |
| `equipment`  | `id` (owned equipment id), `slotitemId` (master equipment id), `name`, `type` (master type array or scalar), `level`, `rarity`, `icon`                                                               |
| `fleets`     | `id`, `name`, `ships` (owned roster ids), `flagshipId`                                                                                                                                               |
| `resources`  | `id`, `name`, `type`, `count`, `maxAmount`                                                                                                                                                           |
| `docks`      | `id`, `kind` (`repair` or `construction` for the corresponding poi slices), `shipId`, `state`, `completeTime`                                                                                        |
| `masterData` | `id`, `name`, `type`, `typeId`, `category`                                                                                                                                                           |

For real poi owned rows, ship `name`/`type` are joined from `const.$ships[shipId]`, and equipment `name`/`type`/`rarity` from `const.$equips[slotitemId]`. Repair `shipId` comes from `api_ship_id`; construction `shipId` comes from `api_created_ship_id`. Missing state remains an explicit `{ "available": false, "partial": true, "items": [] }` response.

Use a trusted TLS proxy for remote access. The concrete local configuration in [caddy-local-tls.md](caddy-local-tls.md) listens at `https://localhost`, connects to `127.0.0.1:8765`, and explicitly sends `Host: 127.0.0.1:8765` and `Origin: http://127.0.0.1:8765` upstream. It also maps the response's CORS origin back to `https://localhost`, so browser requests use the same validated loopback tuple. Install/trust Caddy's local certificate (or replace `tls internal` with a trusted certificate), keep the plugin on its documented port, and retain bearer authentication. Forwarded headers are not trusted and do not relax validation. Do not put the bearer token in a URL.
