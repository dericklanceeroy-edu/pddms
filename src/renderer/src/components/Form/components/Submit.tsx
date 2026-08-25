import { Button } from 'flowbite-react'
import { ComponentProps, PropsWithChildren } from 'react'

export default function Submit({
  children,
  ...props
}: PropsWithChildren<ComponentProps<typeof Button>>) {
  return (
    <Button type="submit" color="primary" className="w-full" {...props}>
      {children}
    </Button>
  )
}
