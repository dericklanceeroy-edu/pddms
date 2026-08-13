import { accessControl, resources } from '@libs/access-control'
import type { GlobalContext } from '@libs/api'
import { authGuard } from '@libs/api/guards'
import { channels } from '@shared/constants'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import * as repository from './repository'
import * as validation from './validation'

export function setupAccountHandlers(ctx: GlobalContext) {
  ipcMain.handle(channels.account.create, async (_, payload) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .createAny(resources.account)
      })

      const data = validation.newAccountSchema.parse(payload)

      const newAccount = await repository.insert({
        ...data,
        password: await hash(data.password)
      })

      return {
        success: true,
        account: newAccount
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle(channels.account.getById, async (_, id) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .readAny(resources.account)
      })

      if (!validation.isAccountId(id)) {
        return { success: false }
      }

      const account = await repository.findById(id)

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

  ipcMain.handle(channels.account.getByUsername, async (_, username) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .readAny(resources.account)
      })

      if (!validation.isAccountUsername(username)) {
        return { success: false }
      }

      const account = await repository.findByUsername(username)

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

  ipcMain.handle(channels.account.updateById, async (_, id, payload) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .updateAny(resources.account)
      })

      const data = validation.accountUpdateSchema.parse(payload)

      await repository.updateById(id, data)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle(channels.account.deleteById, async (_, id) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .deleteAny(resources.account)
      })

      if (!validation.isAccountId(id)) {
        return { success: false }
      }

      await repository.deleteById(id)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
