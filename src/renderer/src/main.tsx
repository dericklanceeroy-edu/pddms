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
    base: 'cursor-pointer',
    color: {
      primary: 'rounded bg-mauve-600 text-white'
    }
  },
  label: {
    root: {
      colors: {
        primary: 'text-black'
      }
    }
  },
  textInput: {
    addon: 'rounded-l',
    field: {
      input: {
        sizes: {
          md: 'px-4 py-2'
        },
        colors: {
          primary: 'bg-neutral-100 border-none focus:ring-amber-500 focus:ring-2'
        },
        withAddon: {
          on: 'rounded-r',
          off: 'rounded'
        }
      }
    }
  }
})

declare module 'flowbite-react/components/Button' {
  interface ButtonColors {
    primary: string
  }
}

declare module 'flowbite-react/components/Label' {
  interface LabelColors {
    primary: string
  }
}

declare module 'flowbite-react/components/TextInput' {
  interface TextInputColors {
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
