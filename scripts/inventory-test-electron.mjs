import { existsSync } from 'node:fs'

export const handlers = new Map()
export const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
export const dialog = {
  showSaveDialog: async () => ({ canceled: false, filePath: process.env.INVENTORY_TEST_EXPORT }),
  showOpenDialog: async () => ({
    canceled: false,
    filePaths: [process.env.INVENTORY_TEST_INVOICE]
  })
}
export const app = { getPath: () => process.env.INVENTORY_TEST_USER_DATA }
export let lastOpenedPath = ''
export const shell = {
  openPath: async (path) => {
    lastOpenedPath = path
    return existsSync(path) ? '' : 'File not found.'
  }
}
