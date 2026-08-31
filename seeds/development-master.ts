import { hash, verify } from 'argon2'
import type { Kysely } from 'kysely'
import { roles } from '../src/shared/constants'
import type { Database } from '../src/shared/types'

const defaultDevelopmentUsername = 'medprix'
const defaultDevelopmentPassword = 'medprix123'

export async function seed(db: Kysely<Database>): Promise<void> {
  const username = process.env.DEV_MASTER_USERNAME?.trim() || defaultDevelopmentUsername
  const password = process.env.DEV_MASTER_PASSWORD || defaultDevelopmentPassword

  if (username.length < 4 || password.length < 8) {
    throw new Error('Development master credentials do not meet account validation requirements.')
  }

  const existingAccount = await db
    .selectFrom('accounts')
    .selectAll()
    .where('username', '=', username)
    .executeTakeFirst()

  if (existingAccount) {
    let passwordMatches = false

    try {
      passwordMatches = await verify(existingAccount.password, password)
    } catch {
      passwordMatches = false
    }

    if (
      existingAccount.role === roles.master &&
      existingAccount.isArchived === 0 &&
      passwordMatches
    ) {
      return
    }

    await db
      .updateTable('accounts')
      .set({
        role: roles.master,
        password: await hash(password),
        isArchived: 0
      })
      .where('id', '=', existingAccount.id)
      .executeTakeFirstOrThrow()

    return
  }

  await db
    .insertInto('accounts')
    .values({
      role: roles.master,
      username,
      password: await hash(password)
    })
    .executeTakeFirstOrThrow()
}
