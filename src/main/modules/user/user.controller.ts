import { response } from '@lib/api'
import { channels } from '@shared/constants'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import { NoResultError } from 'kysely'
import { ZodError } from 'zod'
import { deleteById, findById, findByUsername, insert, updateById } from './user.repository'
import { isUserId, isUserUsername, newUserSchema, userUpdateSchema } from './user.validation'

ipcMain.handle(channels.user.create, async (_, payload) => {
  try {
    const data = newUserSchema.parse(payload)

    const newUser = await insert({
      ...data,
      password: await hash(data.password)
    })

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

    const user = await findById(id)

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

    const user = await findByUsername(username)

    return response.ok({ payload: user })
  } catch {
    return response.error()
  }
})

ipcMain.handle(channels.user.updateById, async (_, id, payload) => {
  try {
    const data = userUpdateSchema.parse(payload)

    await updateById(id, data)

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

    return response.ok({ payload: await deleteById(id) })
  } catch (error) {
    if (error instanceof NoResultError) {
      return response.error({ message: 'User not found' })
    }

    return response.error()
  }
})
