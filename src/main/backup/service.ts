import { env } from '@main/env'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createBackup } from './local'

/**
 * Creates or updates database backup in Google Drive.
 */
export async function backupDatabase(): Promise<void> {
  const snapshot = await createBackup()
  const { drive } = await import('@main/google/drive')
  const { data } = await drive.files.list({
    q: `name = '${env.DATABASE_BACKUP}' and trashed = false`,
    fields: 'files(id)'
  })

  const fileId = data.files?.[0]?.id

  const media = {
    mimeType: 'application/octet-stream',
    body: createReadStream(join(snapshot.directory, 'database.sqlite'))
  }

  if (fileId) {
    await drive.files.update({
      fileId,
      media
    })
  } else {
    await drive.files.create({
      requestBody: { name: env.DATABASE_BACKUP },
      media
    })
  }
}
