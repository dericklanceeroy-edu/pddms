import { env } from '@libs/environment-variable'
import { drive } from '@libs/google/drive'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'

/**
 * Creates or updates database backup in Google Drive.
 */
export async function backupDatabase() {
  const { data } = await drive.files.list({
    q: `name = '${env.DATABASE_BACKUP}' and trashed = false`,
    fields: 'files(id)'
  })

  const fileId = data.files?.[0]?.id

  const media = {
    mimeType: 'application/octet-stream',
    body: createReadStream(join(process.cwd(), env.DATABASE))
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
