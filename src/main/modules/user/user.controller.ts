import { response } from '@lib/response'
import { channels } from '@shared/constants'
import { hashSync } from 'bcrypt'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import * as userRepository from './user.repository'
import { isUserId, isUserUsername, newUserSchema, userUpdateSchema } from './user.validation'

ipcMain.handle(channels.user.create, async (_, payload) => {
  try {
    let data = newUserSchema.parse(payload)

    data = {
      ...data,
      password: hashSync(data.password, 10)
    }

    const newUser = await userRepository.insert(data)

    return response.ok({ payload: newUser })
  } catch (error) {
    if (error instanceof ZodError) {
      return response.error({ message: 'Invalid payload' })
    }

    return response.error()
  }
})

ipcMain.handle(channels.user.getById, async (_, id) => {
  try {
    if (!isUserId(id)) {
      return response.error({ message: 'Invalid payload' })
    }

    const user = await userRepository.findById(id)

    return response.ok({ payload: user })
  } catch (error) {
    return response.error()
  }
})

ipcMain.handle(channels.user.getByUsername, async (_, username) => {
  try {
    if (!isUserUsername(username)) {
      return response.error({ message: 'Invalid payload' })
    }

    const user = await userRepository.findByUsername(username)

    return response.ok({ payload: user })
  } catch {
    return response.error()
  }
})

ipcMain.handle(channels.user.updateById, async (_, id, payload) => {
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

ipcMain.handle(channels.user.deleteById, async (_, id) => {
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
