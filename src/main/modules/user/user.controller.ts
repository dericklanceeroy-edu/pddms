import { response } from '@lib/response'
import { channels } from '@shared/constants'
import { hashSync } from 'bcrypt'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import * as userRepository from './user.repository'
import { isUserId, isUserUsername, newUserSchema, userUpdateSchema } from './user.validation'

ipcMain.handle(channels.users.create, async (_, payload) => {
  try {
    let data = newUserSchema.parse(payload)

    data = {
      ...data,
      password: hashSync(data.password, 10)
    }

    return response.ok({ payload: await userRepository.insert(data) })
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.error()
  }
})

ipcMain.handle(channels.users.getById, async (_, id) => {
  try {
    if (!isUserId(id)) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.ok({ payload: await userRepository.findById(id) })
  } catch (error) {
    return response.error()
  }
})

ipcMain.handle(channels.users.getByUsername, async (_, username) => {
  try {
    if (!isUserUsername(username)) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.ok({ payload: await userRepository.findByUsername(username) })
  } catch {
    return response.error()
  }
})

ipcMain.handle(channels.users.updateById, async (_, id, payload) => {
  try {
    const data = userUpdateSchema.parse(payload)

    await userRepository.updateById(id, data)

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

ipcMain.handle(channels.users.deleteById, async (_, id) => {
  try {
    if (!isUserId(id)) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.ok({ payload: await userRepository.deleteById(id) })
  } catch (error) {
    if (error instanceof NoResultError) {
      return response.error({ message: 'User not found' })
    }

    return response.error()
  }
})
