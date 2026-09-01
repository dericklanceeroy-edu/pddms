import { accessControl, authorize } from '@main/access-control'
import { channels, resources } from '@shared/constants'
import { accountUpdateSchema, newAccountSchema } from '@shared/schemas'
import type { Account, AccountWithoutPassword } from '@shared/types'
import { isId } from '@shared/validators'
import { hash } from 'argon2'
import { ipcMain } from 'electron'
import {
  findAll,
  findOneById,
  findOneByUsername,
  insertOne,
  setBlockedById,
  updateOneById
} from './repository'

const withoutPassword = ({ password, ...account }: Account): AccountWithoutPassword => {
  void password
  return account
}

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
      account: withoutPassword(newAccount)
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle(channels.account.getAll, async () => {
  try {
    const permission = authorize((session) =>
      accessControl.can(session.account.role).readAny(resources.account)
    )
    const accounts = (await findAll()).map(withoutPassword)
    return { success: true, accounts: permission.filter(accounts) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
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
      account: account ? withoutPassword(account) : null
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
      account: account ? withoutPassword(account) : null
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

    await updateOneById(id, {
      ...data,
      password: data.password ? await hash(data.password) : undefined
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

ipcMain.handle(channels.account.setBlockedById, async (_, id: unknown, blocked: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).updateAny(resources.account))

    if (!isId(id)) {
      return { success: false }
    }

    if (typeof blocked !== 'boolean') return { success: false, error: 'Invalid status.' }

    const account = await findOneById(id)
    if (!account) return { success: false, error: 'Account not found.' }
    if (account.role === 'master') {
      return { success: false, error: 'The master account cannot be blocked.' }
    }

    await setBlockedById(id, blocked)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
