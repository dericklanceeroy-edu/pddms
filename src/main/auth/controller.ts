import { state } from '@main/api'
import { channels } from '@shared/constants'
import { credentialsSchema } from '@shared/schemas'
import type { Account, AccountWithoutPassword } from '@shared/types'
import { formatValidationError } from '@shared/validation'
import { verify } from 'argon2'
import { ipcMain } from 'electron'
import z from 'zod'
import { findOneById, findOneByUsername } from '../account/repository'

const maxSignInAttempts = 5
const signInWindowMs = 5 * 60 * 1000
const lockoutMs = 60 * 1000
const signInAttempts = new Map<
  string,
  { count: number; lastAttempt: number; blockedUntil: number }
>()

function getLockout(username: string): number {
  const attempt = signInAttempts.get(username)
  if (!attempt) return 0
  const now = Date.now()
  if (attempt.blockedUntil > now) return attempt.blockedUntil
  if (now - attempt.lastAttempt > signInWindowMs) signInAttempts.delete(username)
  return 0
}

function recordFailedSignIn(username: string): void {
  const now = Date.now()
  const previous = signInAttempts.get(username)
  const count = previous && now - previous.lastAttempt <= signInWindowMs ? previous.count + 1 : 1
  signInAttempts.set(username, {
    count,
    lastAttempt: now,
    blockedUntil: count >= maxSignInAttempts ? now + lockoutMs : 0
  })
}

const getPublicAccount = ({ password, ...account }: Account): AccountWithoutPassword => {
  void password
  return account
}

ipcMain.handle(channels.auth.getStatus, async () => {
  if (!state.session) return { success: true, account: null }
  const account = await findOneById(state.session.account.id)
  if (!account || account.isArchived === 1 || account.isVerified !== 1) {
    state.session = undefined
    return { success: true, account: null }
  }
  state.session = { account }
  return { success: true, account: getPublicAccount(account) }
})

ipcMain.handle(channels.auth.signIn, async (_, payload: unknown) => {
  try {
    const data = credentialsSchema.parse(payload)
    const lockout = getLockout(data.username)
    if (lockout) {
      return { success: false, error: 'Too many sign-in attempts. Try again in one minute.' }
    }

    const account = await findOneByUsername(data.username)

    if (account === null) {
      recordFailedSignIn(data.username)
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
      recordFailedSignIn(data.username)
      return { success: false, error: 'The username or password is incorrect.' }
    }

    signInAttempts.delete(data.username)
    state.session = { account }

    return {
      success: true,
      account: getPublicAccount(account)
    }
  } catch (error) {
    console.error('Authentication failed:', error)

    return {
      success: false,
      error:
        error instanceof z.ZodError
          ? formatValidationError(error)
          : 'Unable to authenticate. Please try again.'
    }
  }
})

ipcMain.handle(channels.auth.signOut, () => {
  state.session = undefined

  return { success: true }
})
