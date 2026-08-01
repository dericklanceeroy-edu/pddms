import { response } from '@lib/response'
import { idSchema } from '@lib/schema'
import { apis } from '@shared/constants'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import { newUserSchema, userUpdateSchema } from './user.schema'
import * as userServices from './user.service'

ipcMain.handle(apis.users.insert, async (_, payload) => {
  try {
    const data = newUserSchema.parse(payload)

    return response.ok({ payload: await userServices.insert(data) })
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.error()
  }
})

ipcMain.handle(apis.users.selectById, async (_, payload) => {
  try {
    const data = idSchema.parse(payload)

    return response.ok({ payload: await userServices.selectById(data.id) })
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.error()
  }
})

ipcMain.handle(apis.users.updateById, async (_, payload) => {
  try {
    const { id, ...data } = userUpdateSchema.parse(payload)

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

ipcMain.handle(apis.users.deleteById, async (_, payload) => {
  try {
    const data = idSchema.parse(payload)

    return response.ok({ payload: await userServices.deleteById(data.id) })
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
