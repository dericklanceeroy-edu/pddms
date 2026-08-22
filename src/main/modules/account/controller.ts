import { accessControl, authorize } from '@libs/access-control'
import { isId } from '@libs/db'
import { channels, resources } from '@shared/constants'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import * as repository from './repository'
import * as validation from './validation'

ipcMain.handle(channels.account.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.account))

    const data = validation.newAccountSchema.parse(payload)

    const newAccount = await repository.insertOne({
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

    if (!validation.isAccountId(id)) {
      return { success: false }
    }

    const account = await repository.findOneById(id)

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

    if (!validation.isAccountUsername(username)) {
      return { success: false }
    }

    const account = await repository.findOneByUsername(username)

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

    const data = validation.accountUpdateSchema.parse(payload)

    if (data.role === 'master') {
      return { success: false }
    }

    await repository.updateOneById(id, data)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle(channels.account.deleteOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.account))

    if (!validation.isAccountId(id)) {
      return { success: false }
    }

    await repository.deleteOneById(id)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
