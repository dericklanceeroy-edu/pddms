import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const { ELECTRON_RUN_AS_NODE, ...environment } = process.env
void ELECTRON_RUN_AS_NODE

const command = process.execPath
const electronVitePath = fileURLToPath(
  new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url)
)
const child = spawn(command, [electronVitePath, ...process.argv.slice(2)], {
  env: environment,
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
