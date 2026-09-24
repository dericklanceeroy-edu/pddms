import { countAll, insertMasterIfEmpty } from '@main/account/repository'
import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels, roles } from '@shared/constants'
import { masterSetupSchema, newAccountSchema } from '@shared/schemas'
import { publicAccount } from '@shared/security'
import { formatValidationError } from '@shared/validation'
import { hash } from 'argon2'

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
    state.database.stale = true

    return { success: true, account: publicAccount(account) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
