import { state } from '@main/api'
import { channels } from '@shared/constants'
import { credentialsSchema } from '@shared/schemas'
import type { Account, AccountWithoutPassword } from '@shared/types'
import { verify } from 'argon2'
import { ipcMain } from 'electron'
import { findOneByUsername } from '../account/repository'

const getPublicAccount = ({ password, ...account }: Account): AccountWithoutPassword => {
  void password
  return account
}

ipcMain.handle(channels.auth.getStatus, () => ({
  success: true,
  account: state.session ? getPublicAccount(state.session.account) : null
}))

ipcMain.handle(channels.auth.signIn, async (_, payload: unknown) => {
  try {
    const data = credentialsSchema.parse(payload)

    const account = await findOneByUsername(data.username)

    if (account === null) {
      return { success: false, error: 'The username or password is incorrect.' }
    }

    if (account.isArchived === 1) {
      return { success: false, error: 'This user is blocked from accessing the system.' }
    }

    if (account.isVerified !== 1) {
      return { success: false, error: 'This account has not been verified.' }
    }

    const isPasswordCorrect = await verify(account.password, data.password)

    if (!isPasswordCorrect) {
      return { success: false, error: 'The username or password is incorrect.' }
    }

    state.session = { account }

    return {
      success: true,
      account: getPublicAccount(account)
    }
  } catch (error) {
    console.error('Authentication failed:', error)

    return {
      success: false,
      error: 'Unable to authenticate. Please try again.'
    }
  }
})

ipcMain.handle(channels.auth.signOut, () => {
  state.session = undefined

  return { success: true }
})
