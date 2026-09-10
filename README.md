# poi-plugin-server

`poi-plugin-server` exposes a versioned, authenticated read-only JSON projection of current poi data.

The installable entry follows poi's plugin loader: `package.poiPlugin` supplies metadata, `pluginDidLoad()` and `pluginWillUnload()` are zero-argument lifecycle hooks, and `settingsClass` is a React component using poi's React runtime.

After enabling the plugin, use `/api/v1` for discovery, `/api/v1/snapshot` for all available datasets, or `/api/v1/data/{dataset}` for one of `ships`, `equipment`, `fleets`, `resources`, `docks`, and `masterData`. Every request needs `Authorization: Bearer <token>`. Tokens are never accepted in URLs.

The default listener is loopback on port 8765. LAN binding is an explicit setting and still requires authentication. HTTP on an untrusted network must be placed behind a trusted TLS tunnel or reverse proxy that connects to the loopback listener and preserves the client-side `Host`/`Origin` validation; forwarded headers do not bypass those checks.

This initial slice is JSON HTTP only. WebSocket and MCP are separate later outcomes. Run the complete local gate with `corepack pnpm install --frozen-lockfile` followed by `corepack pnpm run check`.
