import { response } from '@lib/response'
import { apis } from '@shared/constants'
import { hashSync } from 'bcrypt'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import * as userServices from './user.repository'
import { isUserId, newUserSchema, userUpdateSchema } from './user.validation'

ipcMain.handle(apis.users.create, async (_, payload) => {
  try {
    let data = newUserSchema.parse(payload)

    data = {
      ...data,
      password: hashSync(data.password, 10)
    }

    return response.ok({ payload: await userServices.insert(data) })
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.error()
  }
})

ipcMain.handle(apis.users.getById, async (_, id) => {
  try {
    if (!isUserId(id)) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.ok({ payload: await userServices.findById(id) })
  } catch {
    return response.error()
  }
})

ipcMain.handle(apis.users.updateById, async (_, id, payload) => {
  try {
    const data = userUpdateSchema.parse(payload)

    await userServices.updateById(id, data)

    return response.ok()
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    if (error instanceof NoResultError) {
      return response.error({ message: 'User not found' })
    }

    return response.error()
  }
})

ipcMain.handle(apis.users.deleteById, async (_, id) => {
  try {
    if (!isUserId(id)) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.ok({ payload: await userServices.deleteById(id) })
  } catch (error) {
    if (error instanceof NoResultError) {
      return response.error({ message: 'User not found' })
    }

    return response.error()
  }
})
