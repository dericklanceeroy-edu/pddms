import type { Permission } from 'accesscontrol'
import { type GlobalContext, UnauthorizedError } from '.'

/**
 * Guards the controller by requiring an authenticated session and granted permission.
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
