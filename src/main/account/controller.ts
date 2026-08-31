import { accessControl, authorize } from '@main/access-control'
import { channels, resources } from '@shared/constants'
import { accountUpdateSchema, newAccountSchema } from '@shared/schemas'
import { isId } from '@shared/validators'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import {
  archiveOneById,
  findOneById,
  findOneByUsername,
  insertOne,
  updateOneById
} from './repository'

ipcMain.handle(channels.account.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.account))

    const data = newAccountSchema.parse(payload)
    const newAccount = await insertOne({
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

ipcMain.handle(channels.account.getOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.account))

    if (!isId(id)) {
      return { success: false }
    }

    const account = await findOneById(id)

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

ipcMain.handle(channels.account.getOneByUsername, async (_, username: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.account))

    if (typeof username !== 'string') {
      return { success: false }
    }

    const account = await findOneByUsername(username)

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

ipcMain.handle(channels.account.updateOneById, async (_, id: unknown, payload: unknown) => {
  try {
    if (!isId(id)) {
      return { success: false }
    }

    authorize((session) => accessControl.can(session.account.role).updateAny(resources.account))

    const data = accountUpdateSchema.parse(payload)

    if (data.role === 'master') {
      return { success: false }
    }

    await updateOneById(id, data)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle(channels.account.archiveOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.account))

    if (!isId(id)) {
      return { success: false }
    }

    await archiveOneById(id)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
