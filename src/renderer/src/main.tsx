import './assets/index.css'

import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createTheme, ThemeProvider } from 'flowbite-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const theme = createTheme({
  button: {
    base: 'text-4xl rounded cursor-pointer font-normal',
    color: {
      primary: 'bg-mauve-600 text-white'
    },
    size: {
      md: 'text-base'
    }
  }
})

declare module 'flowbite-react/components/Button' {
  interface ButtonColors {
    primary: string
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
