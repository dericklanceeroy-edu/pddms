import { accessControl, resources } from '@libs/access-control'
import { type GlobalContext, response } from '@libs/api'
import { authGuard } from '@libs/api/guards'
import { channels } from '@shared/constants'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import { deleteById, findById, findByUsername, insert, updateById } from './repository'
import { accountUpdateSchema, isAccountId, isAccountUsername, newAccountSchema } from './validation'

export function setupAccountHandlers(ctx: GlobalContext) {
  ipcMain.handle(channels.account.create, async (_, payload) => {
    try {
      authGuard(ctx, (session) => {
        // prettier-ignore
        return accessControl
          .can(session.role)
          .createAny(resources.account)
      })

      const data = newAccountSchema.parse(payload)

      const newAccount = await insert({
        ...data,
        password: await hash(data.password)
      })

      return response.ok({ payload: newAccount })
    } catch (error) {
      return response.error({
        message: error instanceof Error ? error.message : undefined
      })
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

      if (!isAccountId(id)) {
        return response.error({ message: 'Invalid payload' })
      }

      const account = await findById(id)

      return response.ok({ payload: account })
    } catch (error) {
      return response.error({
        message: error instanceof Error ? error.message : undefined
      })
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

      if (!isAccountUsername(username)) {
        return response.error({ message: 'Invalid payload' })
      }

      const account = await findByUsername(username)

      return response.ok({ payload: account })
    } catch (error) {
      return response.error({
        message: error instanceof Error ? error.message : undefined
      })
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

      const data = accountUpdateSchema.parse(payload)

      await updateById(id, data)

      return response.ok()
    } catch (error) {
      return response.error({
        message: error instanceof Error ? error.message : undefined
      })
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

      if (!isAccountId(id)) {
        return response.error({ message: 'Invalid payload' })
      }

      return response.ok({ payload: await deleteById(id) })
    } catch (error) {
      return response.error({
        message: error instanceof Error ? error.message : undefined
      })
    }
  })
}
