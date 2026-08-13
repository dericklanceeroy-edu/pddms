import { globalContext } from '@libs/api'
import { channels } from '@shared/constants'
import { ipcMain } from 'electron'
import * as controllers from './controller'

export function setupAuthChannels() {
  ipcMain.handle(channels.auth.signIn, controllers.signIn(globalContext))
  ipcMain.handle(channels.auth.signOut, controllers.signOut(globalContext))
}
