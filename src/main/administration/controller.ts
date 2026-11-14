import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { windowDialog } from '@main/api/dialogs'
import { ipcMain } from '@main/api/ipc'
import { auditResources, listAudit } from '@main/audit/repository'
import {
  backupDirectory,
  createBackup,
  listBackups,
  restoreBackup,
  validateBackup
} from '@main/backup/local'
import { channels, resources, roles } from '@shared/constants'
import { BrowserWindow } from 'electron'
import { dirname } from 'node:path'
import z from 'zod'

const admin = (): void => {
  authorize((session) => accessControl.can(session.account.role).readAny(resources.administration))
}
ipcMain.handle(channels.administration.logs, async (_, payload: unknown) => {
  admin()
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
  const data = z
    .strictObject({
      search: z.string().trim().max(100),
      beforeId: z.number().int().positive().optional(),
      from: date,
      to: date,
      result: z.enum(['success', 'failed', 'denied', 'started', 'cancelled']).optional(),
      resource: z.string().trim().max(60).optional()
    })
    .refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: 'The start date must be on or before the end date.'
    })
    .parse(payload)
  return {
    success: true,
    records: await listAudit(data),
    resources: data.beforeId ? undefined : await auditResources()
  }
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
ipcMain.handle(channels.administration.backup, async (event) => {
  admin()
  const choice = await windowDialog(event).showOpenDialog({
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
ipcMain.handle(channels.administration.restore, async (event) => {
  admin()
  const choice = await windowDialog(event).showOpenDialog({
    title: 'Select backup manifest.json',
    defaultPath: backupDirectory(),
    filters: [{ name: 'PDDMS backup manifest', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (choice.canceled || !choice.filePaths[0]) return { success: true, cancelled: true }
  const directory = dirname(choice.filePaths[0])
  try {
    const info = await validateBackup(directory, { allowUpgrade: true })
    const confirm = await windowDialog(event).showMessageBox({
      type: 'warning',
      title: 'Restore application data?',
      message: `Replace current data with the backup from ${new Date(info.createdAt).toLocaleString('en-PH')}?`,
      detail: `A safety backup will be created first. All users will be signed out. Current audit history will be retained. Database and supplier invoice files will be restored.${info.upgradeNeeded ? ' This backup was made by an earlier version of Med Prix; a copy of it is upgraded to the current version before it is restored. The backup folder itself is not changed.' : ''}`,
      buttons: ['Cancel', 'Restore backup'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirm.response !== 1) return { success: true, cancelled: true }
    const result = await restoreBackup(directory)
    state.session = undefined
    state.database.stale = true
    // Note: After a native dialog closes, Windows can leave the page without keyboard focus, so
    // the sign-in fields shown next would not accept typing. Give focus back to the page.
    // Focus is best effort: the restore has already succeeded and must be reported as such.
    try {
      BrowserWindow.fromWebContents(event.sender)?.focus()
      event.sender.focus()
    } catch {
      // Ignored: the sign-in page also requests focus when it loads.
    }
    return { success: true, safety: result.safety, reloadRequired: true }
  } catch {
    return {
      success: false,
      error:
        'Restore rejected or failed. The backup must come from this or an earlier version of Med Prix, pass integrity checks, and include every invoice. Current data is retained if restoration cannot complete.'
    }
  }
})
