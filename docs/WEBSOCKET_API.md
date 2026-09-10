# WebSocket subscriptions

Connect to `ws://127.0.0.1:8765/api/v1/subscribe` (or `wss://localhost/api/v1/subscribe` through the documented Caddy TLS proxy) with an HTTP `Authorization: Bearer <token>` header during the WebSocket handshake. The `Host` and browser `Origin` must be the validated loopback tuple. Credentials in the URL are rejected, including when a valid bearer header is also present.

The server sends one initial message immediately after the upgrade:

```json
{
  "schemaVersion": 1,
  "type": "snapshot",
  "revision": 0,
  "datasets": {
    "ships": {
      "schemaVersion": 1,
      "dataset": "ships",
      "available": true,
      "partial": false,
      "items": []
    }
  }
}
```

When an actual host-store subscription changes the allowlisted projection, every connected client receives an `update` message with the complete shared `datasets` projection and the next integer `revision`. Messages are sent in revision order. Store notifications that leave the projection unchanged produce no message. A client that sends a message is disconnected because this endpoint is read-only.

WebSocket output is bounded: an individual message and the queued bytes per client are limited to 1 MiB, and a client that cannot keep up is terminated. Reconnect after a network failure, token rotation, disable/re-enable, or unload; a new connection receives a fresh snapshot and must not assume that updates sent before reconnect were replayed. Rotation and lifecycle shutdown close existing sessions, and the replacement token is required for new sessions.

The subscription uses the same versioned projection as the JSON endpoints. It never exposes Redux/config state, cookies, game credentials, request bodies, local paths, or arbitrary properties.
