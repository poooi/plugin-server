# poi-plugin-server

`poi-plugin-server` exposes a versioned, authenticated read-only JSON projection of current poi data.

The installable entry follows poi's plugin loader: `package.poiPlugin` supplies metadata, `pluginDidLoad()` and `pluginWillUnload()` are zero-argument lifecycle hooks, and `settingsClass` is a React component using poi's React runtime.

After enabling the plugin, use `/api/v1` for discovery, `/api/v1/snapshot` for all available datasets, or `/api/v1/data/{dataset}` for one of `ships`, `equipment`, `fleets`, `resources`, `docks`, and `masterData`. Every request needs `Authorization: Bearer <token>`. Tokens are never accepted in URLs.

The default listener is loopback on port 8765. LAN binding is an explicit setting and still requires authentication. HTTP on an untrusted network must be placed behind a trusted TLS proxy. The tested local Caddy configuration in [docs/caddy-local-tls.md](docs/caddy-local-tls.md) rewrites upstream `Host` and `Origin` to the exact loopback tuple accepted by the plugin and rewrites the CORS response for `https://localhost`; forwarded headers do not bypass validation, and the bearer token is still required.

This initial slice is JSON HTTP only. WebSocket and MCP are separate later outcomes. Run the complete local gate with `corepack pnpm install --frozen-lockfile` followed by `corepack pnpm run check`.
