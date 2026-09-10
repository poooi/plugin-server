# Deliver poi-plugin-server

## Outcome and authority

Create `poi-plugin-server` in this repository so authorized external clients can read current poi game data through JSON HTTP, WebSocket subscriptions, and MCP. The user authorized this repository-level implementation and Usine Campaign trial, including reviewed pull-request delivery and merge. The repository was empty at preparation. No npm publication or changes to poi or reference plugins are authorized.

## Product contract

- Use pnpm and the Vite+ toolchain for development, build, tests, lint and formatting. Enable strict TypeScript and meaningful unsafe-type lint rules; do not use broad `any` declarations to simulate host compatibility.
- Follow `poooi/plugin-ship-info` package metadata, poi-owned UI dependency externalization and plugin entry conventions. Reference revision: `9e81140209e88d2ab904d716d1bb28782a1d681a`. Check actual host contracts in `poooi/poi` revision `120fe5307a27b7bccc0569fe9df4b646d3d7f9ac`, particularly `views/create-store`, plugin-manager lifecycle/types and Redux info slices. Do not copy the reference's legacy tooling or weak test command.
- Provide a usable plugin settings surface for enabled state, port, LAN opt-in and access-token generation/rotation. Default to loopback, with explicit LAN opt-in and an editable documented default port. Persist settings using poi's configuration facilities. Display useful running/error state without logging tokens.
- Require a high-entropy bearer token for every data transport. Reject missing/invalid credentials before exposing data or upgrading a socket. Do not accept tokens in URLs. Rotation invalidates existing authenticated sessions. LAN mode does not weaken authentication. Document that HTTP on untrusted networks requires a trusted TLS tunnel/reverse proxy.
- Expose a documented, versioned, read-only allowlisted projection: ships, equipment, fleets, resources, repair/construction docks and necessary master-data names/types. Handle startup/partial data explicitly. Never export the full Redux/config state, cookies, game API credentials, request bodies, local paths or arbitrary property access. All protocols use the same projection.
- Validate Host and browser Origin at the network boundary to prevent DNS rebinding and cross-origin access; no wildcard credentialed CORS. Bound request sizes and WebSocket buffering. Unsupported requests must not mutate poi or call game APIs.
- Load starts at most one configured listener; unload closes listeners, sockets, MCP sessions and subscriptions. Settings changes rebind safely, invalid ports are rejected, occupied ports produce actionable state, and rapid disable/re-enable does not leak listeners.
- JSON clients can discover supported datasets and fetch current snapshots. WebSocket clients receive an initial snapshot and ordered updates with documented reconnect behavior; unchanged state and slow clients must not create unbounded traffic/memory.
- MCP uses the maintained official SDK and Streamable HTTP, with a documented endpoint and read-only resources/tools discoverable by a real MCP client. Do not invent a JSON-RPC lookalike. Unsupported capabilities must fail clearly.

## Complete initial outcome sequence

1. Authorized users install/load the plugin, configure secure access and read real poi data via JSON HTTP. Include the packaging, settings, lifecycle and shared security behavior needed for this usable slice, with local Vite+ checks.
2. Authorized WebSocket clients observe the same initial data and subsequent updates, with rejection, rotation, reconnect and unload behavior tested through real sockets.
3. MCP clients discover and read the same data using the SDK, and the final installable package passes cross-protocol security and lifecycle checks with concise client/setup documentation.

Each successor preserves earlier public behavior. Each result owns a separate linked Issue and reviewed PR; these are observable vertical slices, not layer tasks.

## Evidence and stopping condition

Use synthetic non-private fixtures matching the actual host store. Test through the built plugin entry with a host-shaped store/config adapter and actual HTTP/WebSocket/MCP clients, not only isolated handlers. Verify authentication rejection, secret exclusion, changing data, port/LAN settings, token rotation, occupied-port errors, disable/unload/reload and package contents. A harness is not evidence of a graphical poi smoke test; report any actual-host validation separately.

Run frozen pnpm install, Vite+ format/lint/type checks, tests, build and package smoke checks locally through `pnpm run check`. Every delivery requires passing exact-candidate local project checks and an independent exact-SHA review before merge. The user explicitly excluded CI from this trial because this is a new repository: no CI setup or remote CI allowlist is required. Publish an early checkable draft, then continue to accepted delivery. The final Campaign verdict and delivered artifacts must be reported separately.

Non-goals: game automation/write APIs, arbitrary state dumps, public internet hosting, OAuth infrastructure, npm release, unrelated poi/reference refactors.
