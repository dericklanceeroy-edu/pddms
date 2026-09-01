import { countAll, insertOne } from '@main/account/repository'
import { state } from '@main/api'
import { channels, roles } from '@shared/constants'
import { newAccountSchema } from '@shared/schemas'
import type { Account } from '@shared/types'
import { hash } from 'argon2'
import { ipcMain } from 'electron'

const getPublicAccount = ({ password: _, ...account }: Account) => account

ipcMain.handle(channels.setup.getStatus, async () => ({
  success: true,
  requiresSetup: (await countAll()) === 0
}))

ipcMain.handle(channels.setup.createMaster, async (_, payload: unknown) => {
  try {
    if ((await countAll()) !== 0) {
      return { success: false, error: 'Initial setup has already been completed.' }
    }

    const parsed = newAccountSchema.parse({ ...(payload as object), role: roles.master })
    const account = await insertOne({ ...parsed, password: await hash(parsed.password) })

    state.session = { account }

    return { success: true, account: getPublicAccount(account) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
