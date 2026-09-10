import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFile = promisify(execFileCallback)
const rootPath = fileURLToPath(new URL('../', import.meta.url))
const smokeDirectory = await mkdtemp(
  join(dirname(fileURLToPath(import.meta.url)), '.package-smoke-'),
)
try {
  await execFile('corepack', ['pnpm', 'pack', '--pack-destination', smokeDirectory], {
    cwd: rootPath,
  })
  const archive = (await readdir(smokeDirectory)).find((name) => name.endsWith('.tgz'))
  if (!archive) throw new Error('pnpm pack did not produce an archive')
  await execFile('tar', ['-xzf', join(smokeDirectory, archive), '-C', smokeDirectory])

  const packageRoot = join(smokeDirectory, 'package')
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  await access(join(packageRoot, 'dist/index.js'))
  await access(join(packageRoot, 'README.md'))
  await access(join(packageRoot, 'docs/MCP_API.md'))
  const entry = await import(pathToFileURL(join(packageRoot, 'dist/index.js')).href)
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
} finally {
  await rm(smokeDirectory, { recursive: true, force: true })
}
