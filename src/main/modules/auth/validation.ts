import * as z from 'zod'

export const credentialsSchema = z.strictObject({
  username: z.string(),
  password: z.string()
})
