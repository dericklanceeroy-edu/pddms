import { authenticate } from '@google-cloud/local-auth'
import { google } from 'googleapis'
import { join } from 'path'

export const drive = google.drive({
  version: 'v3',
  auth: await authenticate({
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    keyfilePath: join(process.cwd(), 'credentials.json')
  })
})
