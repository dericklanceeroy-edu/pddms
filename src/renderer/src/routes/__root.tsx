import AccountProvider from '@renderer/contexts/Account/Provider'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import type { ReactElement } from 'react'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent(): ReactElement {
  return (
    <>
      <AccountProvider>
        <Outlet />
      </AccountProvider>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-left" />}
    </>
  )
}
