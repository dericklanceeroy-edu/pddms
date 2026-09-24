import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { channels, resources } from '@shared/constants'
import { accountUpdateSchema, newAccountSchema, profileUpdateSchema } from '@shared/schemas'
import { publicAccount } from '@shared/security'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { hash, verify } from 'argon2'
import {
  findAll,
  findOneById,
  findOneByUsername,
  insertOne,
  removeOneById,
  setBlockedById,
  updateOneById
} from './repository'

const withoutPassword = publicAccount

ipcMain.handle(channels.account.createOne, async (_, payload: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).createAny(resources.account))

    const data = newAccountSchema.parse(payload)
    if (data.role === 'master') {
      return { success: false, error: 'Master accounts can only be created during initial setup.' }
    }
    if (await findOneByUsername(data.username)) {
      return { success: false, error: 'That username is already in use.' }
    }
    const newAccount = await insertOne({
      ...data,
      password: await hash(data.password)
    })
    state.database.stale = true

    return {
      success: true,
      account: withoutPassword(newAccount)
    }
  } catch (error) {
    return {
      success: false,
      error: formatValidationError(error)
    }
  }
})

ipcMain.handle(channels.account.getAll, async () => {
  try {
    const permission = authorize((session) =>
      accessControl.can(session.account.role).readAny(resources.account)
    )
    const accounts = (await findAll()).map((account) => ({
      ...withoutPassword(account),
      failedAttempts: account.failedAttempts,
      lockedUntil: account.lockedUntil
    }))
    return { success: true, accounts: permission.filter(accounts) }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
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
      error: formatValidationError(error)
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
      error: formatValidationError(error)
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

    const target = await findOneById(id)
    if (!target) return { success: false, error: 'Account not found.' }
    if (target.role === 'master')
      return {
        success: false,
        error: 'The master account cannot be reassigned. Use My profile for personal updates.'
      }

    if (data.role === 'master') {
      return { success: false }
    }

    if (data.username) {
      const existing = await findOneByUsername(data.username)
      if (existing && existing.id !== id) {
        return { success: false, error: 'That username is already in use.' }
      }
    }

    await updateOneById(id, {
      ...data,
      password: data.password ? await hash(data.password) : undefined,
      ...(data.password ? { failedAttempts: 0, lockedUntil: null, lastFailedAt: null } : {})
    })
    state.database.stale = true

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: formatValidationError(error)
    }
  }
})

ipcMain.handle(channels.account.updateProfile, async (_, payload: unknown) => {
  try {
    const id = state.session!.account.id
    authorize((session) =>
      accessControl
        .can(session.account.role, { user: { id }, account: { accountId: id } })
        .updateOwn(resources.account)
    )
    const data = profileUpdateSchema.parse(payload)
    const current = await findOneById(id)
    if (!current || !(await verify(current.password, data.currentPassword)))
      return { success: false, error: 'Current password is incorrect.' }
    const duplicate = await findOneByUsername(data.username)
    if (duplicate && duplicate.id !== id)
      return { success: false, error: 'That username is already in use.' }
    await updateOneById(id, {
      fullName: data.fullName,
      username: data.username,
      ...(data.password ? { password: await hash(data.password) } : {})
    })
    state.session = undefined
    return { success: true, signInRequired: true }
  } catch {
    return { success: false, error: 'Unable to update profile. Check the fields and try again.' }
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
    state.database.stale = true

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: formatValidationError(error)
    }
  }
})

ipcMain.handle(channels.account.removeOneById, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).deleteAny(resources.account))
    if (!isId(id)) return { success: false, error: 'Invalid account.' }

    const account = await findOneById(id)
    if (!account) return { success: false, error: 'Account not found.' }
    if (account.role === 'master') {
      return { success: false, error: 'Master accounts cannot be deleted.' }
    }

    await removeOneById(id)
    state.database.stale = true
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
