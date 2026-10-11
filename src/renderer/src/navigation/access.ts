import type { Role } from '@shared/types'

const cashierPaths = ['/', '/sales', '/customers']
const staffPaths = ['/', '/sales', '/customers', '/inventory', '/items', '/suppliers', '/wholesale']

export function canAccessPath(role: Role, path: string): boolean {
  if (path === '/profile') return true
  if (role === 'master') return true
  const paths = role === 'cashier' ? cashierPaths : staffPaths
  return paths.some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`))
}

/** Every role lands on its own dashboard at "/"; the main process scopes what it shows. */
export function getHomePath(role: Role): '/' {
  void role
  return '/'
}
