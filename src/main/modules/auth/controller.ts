import type { GlobalContext } from '@libs/api'
import { channels } from '@shared/constants'
import { verify } from 'argon2'
import { ipcMain } from 'electron'
import * as accountRepository from '../account/repository'
import * as validation from './validation'

export function setupAuthHandlers(ctx: GlobalContext) {
  ipcMain.handle(channels.auth.signIn, async (_, payload) => {
    try {
      const data = validation.credentialsSchema.parse(payload)

      const account = await accountRepository.findOneByUsername(data.username)

      if (account === null) {
        return { success: false }
      }

      const isPasswordCorrect = await verify(account.password, data.password)

      if (!isPasswordCorrect) {
        return { success: false }
      }

      ctx.session = { account }

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

  ipcMain.handle(channels.auth.signOut, () => {
    try {
      ctx.session = undefined

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
