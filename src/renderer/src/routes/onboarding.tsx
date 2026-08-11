import { createFileRoute } from '@tanstack/react-router'
import { BsEyeFill } from "react-icons/bs";

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent
})

export default function OnboardingComponent() {
  return <Account />
}

function Account() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup administrator account</h1>
        <p>You can edit this at the settings</p>
      </div>
      <form className='flex flex-col gap-4'>
        <input placeholder='Username' className='bg-neutral-100 py-2 px-4 rounded' />
        <div className='bg-neutral-100 py-2 px-4 rounded flex items-center'>
          <input placeholder='Password' className='flex-1' />
          <button className='cursor-pointer'><BsEyeFill className='text-neutral-400'/></button>
        </div >
        <button className='cursor-pointer bg-mauve-600 text-white py-2 px-4 rounded font-semibold'>Proceeed</button>
      </form>
    </div>
  )
}

function Completion() {
  return <div>Not yet implemented</div>
}
