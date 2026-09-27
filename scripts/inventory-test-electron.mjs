import { existsSync } from 'node:fs'

export const handlers = new Map()
export const renderer = { mainFrame: { url: 'file:///pddms-test/index.html' } }
export const ipcMain = {
  handle: (channel, handler) =>
    handlers.set(channel, async (event, ...args) => {
      const { registerIpcSender } = await import('../src/main/api/ipc.ts')
      registerIpcSender(renderer, 'file:///pddms-test/index.html')
      return handler(
        Object.keys(event).length ? event : { sender: renderer, senderFrame: renderer.mainFrame },
        ...args
      )
    })
}
export const dialog = {
  showSaveDialog: async () => ({ canceled: false, filePath: process.env.INVENTORY_TEST_EXPORT }),
  showOpenDialog: async () => ({
    canceled: false,
    filePaths: [process.env.INVENTORY_TEST_INVOICE]
  })
}
export const app = {
  isPackaged: process.env.SYSTEM_TEST_PHASE === 'packaged',
  getPath: () => process.env.INVENTORY_TEST_USER_DATA
}
export default { app }
export let lastOpenedPath = ''
export const shell = {
  openPath: async (path) => {
    lastOpenedPath = path
    return existsSync(path) ? '' : 'File not found.'
  }
}
