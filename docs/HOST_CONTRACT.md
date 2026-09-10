# Pinned poi host evidence

The entry and fixtures are based on these immutable public revisions:

- [plugin lifecycle](https://github.com/poooi/poi/blob/120fe5307a27b7bccc0569fe9df4b646d3d7f9ac/views/services/plugin-manager/lifecycle.ts): poi imports the package entry, calls `pluginDidLoad()` and `pluginWillUnload()` with zero arguments, and does not await either hook.
- [package reader](https://github.com/poooi/poi/blob/120fe5307a27b7bccc0569fe9df4b646d3d7f9ac/views/services/plugin-manager/read-plugin.tsx): installable metadata is read from `package.poiPlugin`; the module supplies `settingsClass`.
- [plugin types](https://github.com/poooi/poi/blob/120fe5307a27b7bccc0569fe9df4b646d3d7f9ac/views/services/plugin-manager/types.ts): settings classes are React components.
- [poi config](https://github.com/poooi/poi/blob/120fe5307a27b7bccc0569fe9df4b646d3d7f9ac/lib/config.ts): dotted `get`/`set` paths and `config.set` listener registration are used for persistence and rebind.
- [Redux store](https://github.com/poooi/poi/blob/120fe5307a27b7bccc0569fe9df4b646d3d7f9ac/views/redux/create-store.ts): `getStore(path?)` is the host data access surface; there is no invented global `store` dependency.
- [reference plugin](https://github.com/poooi/plugin-ship-info/blob/9e81140209e88d2ab904d716d1bb28782a1d681a/index-src.ts): plugin exports are ordinary module exports and lifecycle hooks are zero-argument functions.

Fixtures use the corresponding real state names: `info.ships`, `info.equips`, `info.fleets`, `info.resources`, `info.repairs`, `info.constructions`, and `const.$ships`/`$shipTypes`. The server reads `getStore()` for each request, so a host state update is visible without copying Redux or configuration state into the plugin.
