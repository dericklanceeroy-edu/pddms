export const userRoles = ['admin', 'cashier', 'staff'] as const

export type UserRole = (typeof userRoles)[number]
export type UserStatus = 'active' | 'inactive'

export interface ManagedUser {
  id: number
  fullName: string
  username: string
  role: UserRole
  status: UserStatus
  lastActiveAt: string | null
}

export interface UserFormValues {
  fullName: string
  username: string
  role: UserRole
  password: string
}

export interface SystemLogEntry {
  id: number
  actor: string
  action: string
  detail: string
  createdAt: string
}

export const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  cashier: 'Cashier',
  staff: 'Staff'
}

export const initialUsers: ManagedUser[] = [
  {
    id: 1,
    fullName: 'Admin User',
    username: 'admin',
    role: 'admin',
    status: 'active',
    lastActiveAt: '2026-08-29T08:42:00+08:00'
  },
  {
    id: 2,
    fullName: 'Mara Santos',
    username: 'mara.cashier',
    role: 'cashier',
    status: 'active',
    lastActiveAt: '2026-08-29T08:17:00+08:00'
  },
  {
    id: 3,
    fullName: 'Joel Ramirez',
    username: 'joel.stock',
    role: 'staff',
    status: 'active',
    lastActiveAt: '2026-08-28T17:51:00+08:00'
  },
  {
    id: 4,
    fullName: 'Ana Villanueva',
    username: 'ana.cashier',
    role: 'cashier',
    status: 'inactive',
    lastActiveAt: '2026-08-20T16:05:00+08:00'
  }
]

export const permissions: Array<{
  label: string
  description: string
  roles: UserRole[]
}> = [
  {
    label: 'Sales & dispensing',
    description: 'Process sales, discounts, payments, and receipts.',
    roles: ['admin', 'cashier']
  },
  {
    label: 'Inventory management',
    description: 'Maintain products, batches, stock, and expiry records.',
    roles: ['admin', 'staff']
  },
  {
    label: 'Suppliers & procurement',
    description: 'Manage suppliers, orders, deliveries, and invoices.',
    roles: ['admin', 'staff']
  },
  {
    label: 'Reports & analytics',
    description: 'View pharmacy performance and financial summaries.',
    roles: ['admin']
  },
  {
    label: 'System administration',
    description: 'Manage access, logs, backups, and restoration.',
    roles: ['admin']
  }
]

export const initialLogs: SystemLogEntry[] = [
  {
    id: 1,
    actor: 'Admin User',
    action: 'Signed in',
    detail: 'Administrator session started.',
    createdAt: '2026-08-29T08:42:00+08:00'
  },
  {
    id: 2,
    actor: 'Mara Santos',
    action: 'Completed sale',
    detail: 'Transaction MP-2026-0829-014 was recorded.',
    createdAt: '2026-08-29T08:21:00+08:00'
  },
  {
    id: 3,
    actor: 'Admin User',
    action: 'Updated account',
    detail: 'Ana Villanueva was marked inactive.',
    createdAt: '2026-08-28T15:14:00+08:00'
  }
]
