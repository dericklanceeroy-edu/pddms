import * as z from 'zod'

export const idSchema = z.strictObject({
  id: z.number().positive()
})

export type IdSchema = z.infer<typeof idSchema>
