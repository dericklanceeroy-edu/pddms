import { UnauthorizedError } from '@libs/access-control'
import type { Permission } from 'accesscontrol'
import type { GlobalContext } from './global-context'

/**
 * Guards the channel by requiring an authenticated session and granted permission.
 */
export function authGuard(
  ctx: GlobalContext,
  permissionHandler: (ctx: NonNullable<GlobalContext['session']>) => Permission
) {
  if (ctx.session === undefined) {
    throw new UnauthorizedError('Session not found')
  }

  const permission = permissionHandler(ctx.session)

  if (!permission.granted) {
    throw new UnauthorizedError('Permission not granted')
  }
}
