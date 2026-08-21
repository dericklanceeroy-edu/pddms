import { state, type State } from '@libs/api'
import type { Permission } from 'accesscontrol'
import { UnauthorizedError } from '.'

export function authorize(
  permissionHandler: (session: NonNullable<State['session']>) => Permission
) {
  if (state.session === undefined) {
    throw new UnauthorizedError('Session not found')
  }

  const permission = permissionHandler(state.session)

  if (!permission.granted) {
    throw new UnauthorizedError('Permission not granted')
  }

  return permission
}
