import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { listAudit } from '@main/audit/repository'
import {
  backupDirectory,
  createBackup,
  listBackups,
  restoreBackup,
  validateBackup
} from '@main/backup/local'
import { channels, resources, roles } from '@shared/constants'
import { dialog } from 'electron'
import { dirname } from 'node:path'
import z from 'zod'

const admin = (): void => {
  authorize((session) => accessControl.can(session.account.role).readAny(resources.administration))
}
ipcMain.handle(channels.administration.logs, async (_, payload: unknown) => {
  admin()
  const data = z
    .strictObject({
      search: z.string().trim().max(100),
      beforeId: z.number().int().positive().optional()
    })
    .parse(payload)
  return { success: true, records: await listAudit(data.search, data.beforeId) }
})
ipcMain.handle(channels.administration.permissions, () => {
  admin()
  const grants = accessControl.getGrants()
  return {
    success: true,
    grants: Object.fromEntries(Object.values(roles).map((role) => [role, grants[role]]))
  }
})
ipcMain.handle(channels.administration.backups, async () => {
  admin()
  return { success: true, backups: await listBackups() }
})
ipcMain.handle(channels.administration.backup, async () => {
  admin()
  const choice = await dialog.showOpenDialog({
    title: 'Choose backup destination folder',
    defaultPath: backupDirectory(),
    properties: ['openDirectory', 'createDirectory']
  })
  if (choice.canceled || !choice.filePaths[0]) return { success: true, cancelled: true }
  try {
    return { success: true, backup: await createBackup(choice.filePaths[0]) }
  } catch {
    return {
      success: false,
      error:
        'Backup failed. Check folder access and stored invoice files. No complete backup was created.'
    }
  }
})
ipcMain.handle(channels.administration.restore, async () => {
  admin()
  const choice = await dialog.showOpenDialog({
    title: 'Select backup manifest.json',
    defaultPath: backupDirectory(),
    filters: [{ name: 'PDDMS backup manifest', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (choice.canceled || !choice.filePaths[0]) return { success: true, cancelled: true }
  const directory = dirname(choice.filePaths[0])
  try {
    const info = await validateBackup(directory)
    const confirm = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restore application data?',
      message: `Replace current data with the backup from ${info.createdAt}?`,
      detail:
        'A safety backup will be created first. All users will be signed out. Current audit history will be retained. Database and supplier invoice files will be restored.',
      buttons: ['Cancel', 'Restore backup'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirm.response !== 1) return { success: true, cancelled: true }
    const result = await restoreBackup(directory)
    state.session = undefined
    state.database.stale = true
    return { success: true, safety: result.safety, reloadRequired: true }
  } catch {
    return {
      success: false,
      error:
        'Restore rejected or failed. The backup must match this schema, pass integrity checks, and include every invoice. Current data is retained if restoration cannot complete.'
    }
  }
})
