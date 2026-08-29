import {
  initialLogs,
  initialUsers,
  type ManagedUser,
  type SystemLogEntry,
  type UserFormValues
} from '@renderer/data/userManagement'
import { useState } from 'react'

export function useUserManagement() {
  const [users, setUsers] = useState(initialUsers)
  const [logs, setLogs] = useState(initialLogs)
  const [lastBackupAt, setLastBackupAt] = useState<string | null>('2026-08-28T22:00:00+08:00')

  const addLog = (action: string, detail: string): void => {
    const entry: SystemLogEntry = {
      id: Date.now(),
      actor: 'Admin User',
      action,
      detail,
      createdAt: new Date().toISOString()
    }
    setLogs((current) => [entry, ...current])
  }

  const saveUser = (values: UserFormValues, selectedUser: ManagedUser | null): void => {
    if (selectedUser) {
      setUsers((current) =>
        current.map((user) =>
          user.id === selectedUser.id
            ? { ...user, fullName: values.fullName, username: values.username, role: values.role }
            : user
        )
      )
      addLog('Updated account', `${values.fullName}'s profile and role were updated.`)
      return
    }

    setUsers((current) => [
      {
        id: Date.now(),
        fullName: values.fullName,
        username: values.username,
        role: values.role,
        status: 'active',
        lastActiveAt: null
      },
      ...current
    ])
    addLog('Created account', `${values.fullName} was assigned the ${values.role} role.`)
  }

  const toggleStatus = (selectedUser: ManagedUser): void => {
    if (selectedUser.role === 'admin') return
    const status = selectedUser.status === 'active' ? 'inactive' : 'active'
    setUsers((current) =>
      current.map((user) => (user.id === selectedUser.id ? { ...user, status } : user))
    )
    addLog(
      `${status === 'active' ? 'Activated' : 'Deactivated'} account`,
      `${selectedUser.fullName} is now ${status}.`
    )
  }

  const createBackup = (): void => {
    setLastBackupAt(new Date().toISOString())
    addLog('Created backup', 'A manual database backup was completed.')
  }

  const restoreBackup = (): void =>
    addLog('Requested restore', 'The latest verified backup was selected for restoration.')

  return { users, logs, lastBackupAt, saveUser, toggleStatus, createBackup, restoreBackup }
}
