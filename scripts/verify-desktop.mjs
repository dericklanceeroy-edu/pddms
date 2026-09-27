/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable Electron harness. */
import electron from 'electron'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.versions.electron) {
  const { channels } = await import('../src/shared/constants.ts')
  const directory = await mkdtemp(join(tmpdir(), 'pddms-desktop-test-'))
  try {
    const { ELECTRON_RUN_AS_NODE, ...environment } = process.env
    void ELECTRON_RUN_AS_NODE
    const code = await new Promise((resolveExit, reject) => {
      const child = spawn(electron, [fileURLToPath(import.meta.url)], {
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...environment,
          DATABASE: join(directory, 'desktop.db'),
          DESKTOP_TEST_DIRECTORY: directory,
          DESKTOP_TEST_CHANNELS: JSON.stringify(channels)
        }
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('Desktop smoke test timed out.'))
      }, 45_000)
      child.on('error', reject)
      child.on('exit', (status) => {
        clearTimeout(timeout)
        resolveExit(status)
      })
    })
    assert.equal(code, 0, 'Desktop smoke test failed')
  } finally {
    const log = await readFile(join(directory, 'desktop.log'), 'utf8').catch(() => '')
    if (log) console.log(log)
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-desktop-test-'))
    await rm(directory, { recursive: true, maxRetries: 10, retryDelay: 200 })
  }
} else {
  const { app } = electron
  const log = (message) =>
    appendFileSync(join(process.env.DESKTOP_TEST_DIRECTORY, 'desktop.log'), `${message}\n`)
  log('Starting Electron smoke test')
  process.on('uncaughtException', (error) => {
    log(error.stack)
    app.exit(1)
  })
  process.on('unhandledRejection', (error) => {
    log(error?.stack ?? String(error))
    app.exit(1)
  })
  app.setPath('userData', process.env.DESKTOP_TEST_DIRECTORY)
  const windowReady = new Promise((resolveWindow) => {
    app.once('browser-window-created', (_, window) => {
      window.show = () => undefined
      window.webContents.once('did-finish-load', () => resolveWindow(window))
    })
  })
  void (async () => {
    try {
      await import('../out/main/index.js')
      const window = await windowReady
      log('Renderer loaded')
      const evaluate = (code) => window.webContents.executeJavaScript(code)
      const invoke = (channel, ...args) =>
        evaluate(
          `window.electron.ipcRenderer.invoke(${JSON.stringify(channel)}, ...${JSON.stringify(args)})`
        )
      const waitFor = async (expression) => {
        const until = Date.now() + 10_000
        while (!(await evaluate(expression))) {
          assert.ok(Date.now() < until, `Renderer did not reach: ${expression}`)
          await new Promise((resolveTick) => setTimeout(resolveTick, 50))
        }
      }
      const reload = async () => {
        const loaded = new Promise((resolveLoad) =>
          window.webContents.once('did-finish-load', resolveLoad)
        )
        window.webContents.reload()
        await loaded
      }
      const channels = JSON.parse(process.env.DESKTOP_TEST_CHANNELS)
      await waitFor("location.hash.startsWith('#/new')")
      assert.equal((await invoke(channels.setup.getStatus)).requiresSetup, true)
      assert.equal(
        (
          await invoke(channels.setup.createMaster, {
            fullName: 'Desktop Admin',
            username: 'desktop-admin',
            password: 'DisposableTest123'
          })
        ).success,
        true
      )
      await reload()
      await waitFor("document.body.innerText.includes('Daily sales')")
      assert.equal((await invoke(channels.dashboard.getAdmin)).success, true)
      assert.equal(
        (
          await invoke(channels.account.createOne, {
            fullName: 'Desktop Staff',
            username: 'desktop-staff',
            password: 'DisposableTest123',
            role: 'staff'
          })
        ).success,
        true
      )
      await evaluate("location.hash = '#/inventory'")
      await reload()
      await waitFor("document.body.innerText.includes('Inventory')")
      assert.equal((await invoke(channels.auth.signOut)).success, true)
      await evaluate("location.hash = '#/users'")
      await reload()
      await waitFor("location.hash === '#/signIn'")
      assert.equal((await invoke(channels.account.getAll)).success, false)
      assert.equal(
        (
          await invoke(channels.auth.signIn, {
            username: 'desktop-staff',
            password: 'DisposableTest123'
          })
        ).success,
        true
      )
      await reload()
      await waitFor("document.body.innerText.includes('Daily sales')")
      await evaluate("location.hash = '#/users'")
      await waitFor("location.hash === '#/'")
      assert.equal((await invoke(channels.account.getAll)).success, false)
      log(
        'PASS: real Electron, fresh setup, preload IPC, dashboard, file-route reload, logout navigation, Staff route and IPC denial'
      )
      app.exit(0)
    } catch (error) {
      log(error.stack ?? String(error))
      app.exit(1)
    }
  })()
}
