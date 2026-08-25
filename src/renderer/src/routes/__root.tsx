import AccountProvider from '@renderer/contexts/Account/Provider'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <>
      <AccountProvider>
        <Outlet />
      </AccountProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  )
}
