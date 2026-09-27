import { findOneById } from '@main/account/repository'
import { state } from '@main/api'
import { audit } from '@main/audit/repository'
import { db } from '@main/db'
import { channels } from '@shared/constants'
import { isLocked } from '@shared/security'
import { ipcMain as electronIpc, type WebContents } from 'electron'

const trustedSenders = new WeakMap<WebContents, string>()
export function registerIpcSender(sender: WebContents, entryUrl: string): void {
  trustedSenders.set(sender, entryUrl.split('#')[0])
}

const publicChannels: string[] = [...Object.values(channels.auth), ...Object.values(channels.setup)]
let queue: Promise<unknown> = Promise.resolve()
export const ipcMain = {
  handle(channel: string, listener: Parameters<typeof electronIpc.handle>[1]): void {
    electronIpc.handle(channel, (event, ...args: unknown[]) => {
      const run = async (): Promise<unknown> => {
        if (
          !event.senderFrame ||
          event.senderFrame !== event.sender.mainFrame ||
          trustedSenders.get(event.sender) !== event.senderFrame.url.split('#')[0]
        )
          return { success: false, error: 'Untrusted application window.' }
        const actor = state.session?.account
        // Note: Logging failures must never prevent session termination.
        if (channel === channels.auth.signOut || channel === channels.auth.signIn)
          state.session = undefined
        let logId: number | undefined
        try {
          if (!publicChannels.includes(channel)) {
            const current = actor ? await findOneById(actor.id) : null
            if (!current || current.isArchived || !current.isVerified || isLocked(current)) {
              state.session = undefined
              await audit(channel, 'denied', actor)
              return {
                success: false,
                error: 'Session expired or access is locked. Sign in again.'
              }
            }
            state.session = { account: current }
          }
          const mutation =
            /\.(create|update|remove|upload|record|setBlocked|checkout|deliver|cancel|schedule|pay|signIn|signOut)/.test(
              channel
            ) ||
            channel === channels.administration.backup ||
            channel === channels.administration.restore
          let action = channel
          if (channel === channels.account.setBlockedById)
            action = args[1] ? 'account.blocked' : 'account.unblocked'
          if (
            channel === channels.account.updateOneById &&
            args[1] &&
            typeof args[1] === 'object' &&
            'role' in args[1]
          )
            action = 'account.roleChanged'
          if (mutation)
            logId = await audit(
              action,
              'started',
              actor,
              typeof args[0] === 'number' ? args[0] : null
            )
          const result = await listener(event, ...args)
          if (logId) {
            const target =
              result?.account ?? result?.order ?? result?.sale ?? result?.payment ?? result?.invoice
            const targetId =
              target?.id ?? (typeof result?.data === 'number' ? result.data : undefined)
            const signedIn =
              channel === channels.auth.signIn || channel === channels.setup.createMaster
                ? state.session?.account
                : undefined
            await db
              .updateTable('auditLogs')
              .set({
                result:
                  result?.success === false
                    ? 'failed'
                    : result?.cancelled
                      ? 'cancelled'
                      : 'success',
                ...(Number.isInteger(targetId) ? { targetId } : {}),
                ...(signedIn ? { actorId: signedIn.id, actorName: signedIn.username } : {})
              })
              .where('id', '=', logId)
              .execute()
          }
          return result
        } catch {
          if (logId)
            await db
              .updateTable('auditLogs')
              .set({ result: 'failed' })
              .where('id', '=', logId)
              .execute()
              .catch(() => undefined)
          if (channel === channels.auth.signOut) return { success: true }
          return {
            success: false,
            error:
              'Unable to complete the operation safely. Reload and check the saved record before retrying.'
          }
        }
      }
      const pending = queue.then(run, run)
      queue = pending.catch(() => undefined)
      return pending
    })
  }
}
