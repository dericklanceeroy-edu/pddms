import { type GlobalContext, response } from '@libs/api'
import { channels } from '@shared/constants'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import { deleteById, findById, findByUsername, insert, updateById } from './repository'
import { isAccountId, isAccountUsername, newAccountSchema, accountUpdateSchema } from './validation'

export function setupAccountHandlers(ctx: GlobalContext) {
  ipcMain.handle(channels.account.create, async (_, payload) => {
    try {
      const data = newAccountSchema.parse(payload)

      const newAccount = await insert({
        ...data,
        password: await hash(data.password)
      })

      return response.ok({ payload: newAccount })
    } catch (error) {
      if (error instanceof ZodError) {
        return response.error({ message: 'Invalid payload' })
      }

      return response.error()
    }
  })

  ipcMain.handle(channels.account.getById, async (_, id) => {
    try {
      if (!isAccountId(id)) {
        return response.error({ message: 'Invalid payload' })
      }

      const account = await findById(id)

      return response.ok({ payload: account })
    } catch (error) {
      return response.error()
    }
  })

  ipcMain.handle(channels.account.getByUsername, async (_, username) => {
    try {
      if (!isAccountUsername(username)) {
        return response.error({ message: 'Invalid payload' })
      }

      const account = await findByUsername(username)

      return response.ok({ payload: account })
    } catch {
      return response.error()
    }
  })

  ipcMain.handle(channels.account.updateById, async (_, id, payload) => {
    try {
      const data = accountUpdateSchema.parse(payload)

      await updateById(id, data)

      return response.ok()
    } catch (error) {
      if (error instanceof ZodError) {
        return response.error({ message: 'Invalid payload' })
      }

      if (error instanceof NoResultError) {
        return response.error({ message: 'Account not found' })
      }

      return response.error()
    }
  })

  ipcMain.handle(channels.account.deleteById, async (_, id) => {
    try {
      if (!isAccountId(id)) {
        return response.error({ message: 'Invalid payload' })
      }

      return response.ok({ payload: await deleteById(id) })
    } catch (error) {
      if (error instanceof NoResultError) {
        return response.error({ message: 'Account not found' })
      }

      return response.error()
    }
  })
}
