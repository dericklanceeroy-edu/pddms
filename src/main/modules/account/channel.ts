import { globalContext } from '@libs/api'
import { channels } from '@shared/constants'
import { ipcMain } from 'electron'
import * as controllers from './controller'

export function setupAccountChannels() {
  ipcMain.handle(channels.account.createOne, controllers.createOne(globalContext))
  ipcMain.handle(channels.account.getOneById, controllers.getOneById(globalContext))
  ipcMain.handle(channels.account.getOneByUsername, controllers.getOneByUsername(globalContext))
  ipcMain.handle(channels.account.updateOneById, controllers.updateOneById(globalContext))
  ipcMain.handle(channels.account.deleteOneById, controllers.deleteOneById(globalContext))
  ipcMain.handle(channels.account.assignRoleById, controllers.assignRoleById(globalContext))
}
