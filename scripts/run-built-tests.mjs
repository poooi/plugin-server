import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const networkAvailable = await new Promise((resolve) => {
  const probe = createServer()
  probe.once('error', (error) => resolve(!(error && error.code === 'EPERM')))
  probe.listen(0, '127.0.0.1', () => probe.close(() => resolve(true)))
})

const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
  env: { ...process.env, ...(networkAvailable ? {} : { POI_SERVER_TEST_NO_NETWORK: '1' }) },
  stdio: 'inherit',
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
