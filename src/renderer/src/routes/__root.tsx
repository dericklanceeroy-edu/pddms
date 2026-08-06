import UserProvider from '@renderer/contexts/UserContext'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootComponent
})

function RootComponent() {
  return (
    <>
      <UserProvider>
        <Outlet />
      </UserProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  )
}
