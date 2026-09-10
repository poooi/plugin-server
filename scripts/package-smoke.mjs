import { access, readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await access(new URL('../dist/index.js', import.meta.url))
const entry = await import(new URL('../dist/index.js', import.meta.url).href)
if (typeof entry.default !== 'function' || entry.pluginMetadata?.id !== packageJson.name) {
  throw new Error('package entry does not expose the installable poi plugin')
}
if (typeof entry.pluginDidLoad !== 'function' || typeof entry.pluginWillUnload !== 'function') {
  throw new Error('package entry is missing zero-argument poi lifecycle hooks')
}
if (typeof entry.settingsClass !== 'function' || entry.SETTINGS_DESCRIPTOR?.length !== 4) {
  throw new Error('package entry is missing the renderable settings surface')
}
const metadata = packageJson.poiPlugin
if (!metadata || typeof metadata.title !== 'string' || typeof metadata.description !== 'string') {
  throw new Error('package.poiPlugin metadata is incomplete')
}
process.stdout.write('package smoke: ok\n')
