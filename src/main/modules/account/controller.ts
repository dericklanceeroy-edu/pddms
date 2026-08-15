import { accessControl, resources } from '@libs/access-control'
import { type GlobalContext, authGuard } from '@libs/api'
import { hash } from 'argon2'
import type { IpcMainInvokeEvent } from 'electron'
import * as repository from './repository'
import * as validation from './validation'

export function createOne(globalContext: GlobalContext) {
  return async (_: IpcMainInvokeEvent, payload: any) => {
    try {
      authGuard(globalContext, (session) =>
        accessControl.can(session.account.role).createAny(resources.account)
      )

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
  }
}

export function getOneById(globalContext: GlobalContext) {
  return async (_: IpcMainInvokeEvent, id: any) => {
    try {
      authGuard(globalContext, (session) =>
        accessControl.can(session.account.role).readAny(resources.account)
      )

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
  }
}

export function getOneByUsername(globalContext: GlobalContext) {
  return async (_: IpcMainInvokeEvent, username: any) => {
    try {
      authGuard(globalContext, (session) =>
        accessControl.can(session.account.role).readAny(resources.account)
      )

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
  }
}

export function updateOneById(globalContext: GlobalContext) {
  return async (_: IpcMainInvokeEvent, id: any, payload: any) => {
    try {
      authGuard(globalContext, (session) =>
        accessControl.can(session.account.role).updateAny(resources.account)
      )

      const data = validation.accountUpdateSchema.parse(payload)

      if (data.role === 'root') {
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
  }
}

// To-do: Turn this into a soft delete.
export function deleteOneById(globalContext: GlobalContext) {
  return async (_: IpcMainInvokeEvent, id: any) => {
    try {
      authGuard(globalContext, (session) =>
        accessControl.can(session.account.role).deleteAny(resources.account)
      )

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
  }
}
