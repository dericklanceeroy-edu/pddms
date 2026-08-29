import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-neutral-950">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}

export function CenteredPageHeader({
  title,
  description
}: {
  title: string
  description: string
}): ReactElement {
  return (
    <header className="mb-5 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </header>
  )
}
