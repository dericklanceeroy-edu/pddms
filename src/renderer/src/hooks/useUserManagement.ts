import type { ManagedUser, UserFormValues, UserUpdateValues } from '@renderer/data/userManagement'
import {
  createAccount,
  deleteAccount,
  getAccounts,
  setAccountBlocked,
  updateAccount
} from '@renderer/services/accounts'
import { useCallback, useEffect, useState } from 'react'

interface UserManagementState {
  users: ManagedUser[]
  isLoading: boolean
  error: string
  load: () => Promise<void>
  saveUser: (values: UserFormValues) => Promise<void>
  updateUser: (user: ManagedUser, values: UserUpdateValues) => Promise<void>
  toggleStatus: (user: ManagedUser) => Promise<void>
  deleteUser: (user: ManagedUser) => Promise<void>
}

export function useUserManagement(): UserManagementState {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      setUsers(await getAccounts())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load user accounts.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getAccounts()
      .then((accounts) => {
        if (!cancelled) setUsers(accounts)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load user accounts.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveUser = async (values: UserFormValues): Promise<void> => {
    const user = await createAccount(values)
    setUsers((current) => [user, ...current])
  }

  const toggleStatus = async (user: ManagedUser): Promise<void> => {
    const blocked = user.status === 'active'
    await setAccountBlocked(user.id, blocked)
    setUsers((current) =>
      current.map((value) =>
        value.id === user.id ? { ...value, status: blocked ? 'blocked' : 'active' } : value
      )
    )
  }

  const updateUser = async (user: ManagedUser, values: UserUpdateValues): Promise<void> => {
    const { password, ...accountValues } = values
    await updateAccount(user.id, {
      ...accountValues,
      ...(password ? { password } : {})
    })
    setUsers((current) =>
      current.map((value) => (value.id === user.id ? { ...value, ...accountValues } : value))
    )
  }

  const deleteUser = async (user: ManagedUser): Promise<void> => {
    await deleteAccount(user.id)
    setUsers((current) => current.filter((value) => value.id !== user.id))
  }

  return { users, isLoading, error, load, saveUser, updateUser, toggleStatus, deleteUser }
}
