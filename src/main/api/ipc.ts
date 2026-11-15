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
        const signIn = channel === channels.auth.signIn
        // Note: A sign-in attempt is logged under the username that was typed, not the account
        // that happened to be signed in before it.
        const actor = signIn ? undefined : state.session?.account
        const attempted =
          signIn && args[0] && typeof args[0] === 'object' && 'username' in args[0]
            ? String((args[0] as { username: unknown }).username)
                .trim()
                .slice(0, 80)
            : ''
        state.denied = false
        state.auditDetails = undefined
        // Note: Logging failures must never prevent session termination.
        if (channel === channels.auth.signOut || signIn) state.session = undefined
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
            /\.(create|update|remove|upload|record|setBlocked|checkout|deliver|cancel|schedule|pay|signIn|signOut|void|archive|restore|merge|apply|start|complete)/.test(
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
          // Note: A refused permission check is logged as "denied", including refused views.
          const denied = (state.denied as boolean | undefined) === true && result?.success === false
          if (denied && !logId) await audit(channel, 'denied', actor)
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
                result: denied
                  ? 'denied'
                  : result?.success === false
                    ? 'failed'
                    : result?.cancelled
                      ? 'cancelled'
                      : 'success',
                ...(Number.isInteger(targetId) ? { targetId } : {}),
                // Note: Old and new values (and a reason) noted by the handler, saved as JSON.
                ...(state.auditDetails && result?.success !== false
                  ? { details: JSON.stringify(state.auditDetails) }
                  : {}),
                ...(signedIn
                  ? { actorId: signedIn.id, actorName: signedIn.username }
                  : signIn && attempted
                    ? { actorName: attempted }
                    : {})
              })
              .where('id', '=', logId)
              .execute()
          }
          return result
        } catch {
          const refused = (state.denied as boolean | undefined) === true
          if (logId)
            await db
              .updateTable('auditLogs')
              .set({ result: refused ? 'denied' : 'failed' })
              .where('id', '=', logId)
              .execute()
              .catch(() => undefined)
          else if (refused) await audit(channel, 'denied', actor).catch(() => undefined)
          if (refused) return { success: false, error: 'You do not have permission to do this.' }
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
