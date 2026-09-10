# MCP API

The plugin uses the maintained official `@modelcontextprotocol/sdk` and its Streamable HTTP transport. The endpoint is `/api/v1/mcp` on the same authenticated listener as JSON and WebSocket. Send `Authorization: Bearer <token>` on every request; the SDK client manages the `Mcp-Session-Id` returned during initialization. Do not put credentials in the endpoint URL.

The server advertises one resource for the full projection and one resource for each dataset:

- `poi://snapshot`
- `poi://data/ships`
- `poi://data/equipment`
- `poi://data/fleets`
- `poi://data/resources`
- `poi://data/docks`
- `poi://data/masterData`

It also advertises the read-only tools `read_poi_snapshot` and `read_poi_{dataset}` for the same dataset names. Resource reads and tool calls return JSON using the exact projection documented in [JSON_API.md](JSON_API.md), including `available` and `partial` for incomplete host state. Unknown resources or tools fail through MCP's normal error response; there are no write or arbitrary-state capabilities.

Example with the official SDK:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const client = new Client({ name: 'example-reader', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8765/api/v1/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
await client.connect(transport)
const resources = await client.listResources()
const data = await client.readResource({ uri: 'poi://data/ships' })
const tools = await client.listTools()
const snapshot = await client.callTool({ name: 'read_poi_snapshot', arguments: {} })
```

The default listener is loopback. LAN binding is an explicit setting and does not weaken authentication. For untrusted networks, use the tested TLS tunnel in [caddy-local-tls.md](caddy-local-tls.md); it validates the upstream loopback `Host` and `Origin`, and forwarded headers do not bypass those checks. Rotation, disable/re-enable, and unload close active MCP sessions, so clients must reconnect with the current token.
