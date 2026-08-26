import { state } from '@main/api'
import { channels } from '@shared/constants'
import { credentialsSchema } from '@shared/schemas'
import { verify } from 'argon2'
import { ipcMain } from 'electron'
import { findOneByUsername } from '../account/repository'

ipcMain.handle(channels.auth.signIn, async (_, payload: unknown) => {
  try {
    const data = credentialsSchema.parse(payload)

    const account = await findOneByUsername(data.username)

    if (account === null) {
      return { success: false }
    }

    const isPasswordCorrect = await verify(account.password, data.password)

    if (!isPasswordCorrect) {
      return { success: false }
    }

    state.session = { account }

    return {
      success: true,
      account
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle(channels.auth.signOut, async () => {
  try {
    state.session = undefined

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
