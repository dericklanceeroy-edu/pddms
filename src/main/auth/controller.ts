import { state } from '@main/api'
import { ipcMain } from '@main/api/ipc'
import { audit } from '@main/audit/repository'
import { db } from '@main/db'
import { channels } from '@shared/constants'
import { credentialsSchema } from '@shared/schemas'
import {
  isLocked,
  LOGIN_LOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  publicAccount
} from '@shared/security'
import { formatValidationError } from '@shared/validation'
import { verify } from 'argon2'
import z from 'zod'
import { findOneById, findOneByUsername } from '../account/repository'

const maxSignInAttempts = LOGIN_MAX_ATTEMPTS
const signInWindowMs = LOGIN_WINDOW_MS
const lockoutMs = LOGIN_LOCK_MS
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
  if (signInAttempts.size >= 1000) signInAttempts.delete(signInAttempts.keys().next().value!)
  const now = Date.now()
  const previous = signInAttempts.get(username)
  const count = previous && now - previous.lastAttempt <= signInWindowMs ? previous.count + 1 : 1
  signInAttempts.set(username, {
    count,
    lastAttempt: now,
    blockedUntil: count >= maxSignInAttempts ? now + lockoutMs : 0
  })
}

ipcMain.handle(channels.auth.getStatus, async () => {
  if (!state.session) return { success: true, account: null }
  const account = await findOneById(state.session.account.id)
  if (!account || account.isArchived === 1 || account.isVerified !== 1 || isLocked(account)) {
    state.session = undefined
    return { success: true, account: null }
  }
  state.session = { account }
  return { success: true, account: publicAccount(account) }
})

ipcMain.handle(channels.auth.signIn, async (_, payload: unknown) => {
  state.session = undefined
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

    if (isLocked(account))
      return { success: false, error: 'Too many sign-in attempts. Try again in one minute.' }

    const isPasswordCorrect = await verify(account.password, data.password)

    if (!isPasswordCorrect) {
      const now = Date.now()
      const reset =
        (account.lockedUntil && Date.parse(account.lockedUntil) <= now) ||
        !account.lastFailedAt ||
        now - Date.parse(account.lastFailedAt) > LOGIN_WINDOW_MS
      const count = reset ? 1 : account.failedAttempts + 1
      const lockedUntil =
        count >= LOGIN_MAX_ATTEMPTS ? new Date(now + LOGIN_LOCK_MS).toISOString() : null
      await db
        .updateTable('accounts')
        .set({ failedAttempts: count, lastFailedAt: new Date(now).toISOString(), lockedUntil })
        .where('id', '=', account.id)
        .execute()
      if (lockedUntil) await audit('auth.locked', 'success', account, account.id)
      return { success: false, error: 'The username or password is incorrect.' }
    }

    if (account.isArchived === 1)
      return { success: false, error: 'This user is blocked from accessing the system.' }
    if (account.isVerified !== 1)
      return { success: false, error: 'This account has not been verified.' }
    await db
      .updateTable('accounts')
      .set({ failedAttempts: 0, lastFailedAt: null, lockedUntil: null })
      .where('id', '=', account.id)
      .execute()

    signInAttempts.delete(data.username)
    state.session = {
      account: { ...account, failedAttempts: 0, lastFailedAt: null, lockedUntil: null }
    }

    return {
      success: true,
      account: publicAccount(account)
    }
  } catch (error) {
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
