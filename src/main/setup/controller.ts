import { countAll, insertMasterIfEmpty } from '@main/account/repository'
import { state } from '@main/api'
import { channels, roles } from '@shared/constants'
import { masterSetupSchema, newAccountSchema } from '@shared/schemas'
import type { Account, AccountWithoutPassword } from '@shared/types'
import { hash } from 'argon2'
import { ipcMain } from 'electron'

const getPublicAccount = ({ password, ...account }: Account): AccountWithoutPassword => {
  void password
  return account
}

ipcMain.handle(channels.setup.getStatus, async () => ({
  success: true,
  requiresSetup: (await countAll()) === 0
}))

ipcMain.handle(channels.setup.createMaster, async (_, payload: unknown) => {
  try {
    if ((await countAll()) !== 0) {
      return { success: false, error: 'Initial setup has already been completed.' }
    }

    const setup = masterSetupSchema.parse(payload)
    const parsed = newAccountSchema.parse({ ...setup, role: roles.master })
    const account = await insertMasterIfEmpty({
      ...parsed,
      password: await hash(parsed.password)
    })
    if (!account) return { success: false, error: 'Initial setup has already been completed.' }

    state.session = { account }

    return { success: true, account: getPublicAccount(account) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
})
