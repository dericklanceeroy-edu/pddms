/**
 * Running this test module using the native Node test runner gives
 * the following error:
 *
 * test at src/main/modules/auth/controller.spec.ts:1:1
 * ✖ src/main/modules/auth/controller.spec.ts (144.858976ms)
 * 'test failed'
 */

import { faker } from '@faker-js/faker'
import { roles } from '@libs/access-control'
import { GlobalContext } from '@libs/api'
import type { Account } from '@libs/db/tables'
import { hash } from 'argon2'
import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'
import * as controllers from './controller'

const mockUsername = faker.internet.username()
const mockPassword = faker.internet.password()

const mockAccount: Account = {
  id: faker.number.int({ min: 1 }),
  role: faker.helpers.arrayElement(Object.values(roles)),
  username: mockUsername,
  password: await hash(mockPassword),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent()
}

mock.module('../account/repository', {
  namedExports: {
    findOneByUsername: async (username: string) =>
      username === mockAccount.username ? mockAccount : null
  }
})

describe('modules/auth/controller.ts', () => {
  describe('signIn', () => {
    let mockGlobalContext: GlobalContext = {}
    let signInHandler: ReturnType<typeof controllers.signIn>

    beforeEach(() => {
      mockGlobalContext = {}
      signInHandler = controllers.signIn(mockGlobalContext)
    })

    it('fails when the payload is malformed', async () => {
      const { success } = await signInHandler(undefined!, null)

      assert.strictEqual(success, false)
    })

    it('fails when the username does not exist', async () => {
      const { success } = await signInHandler(undefined!, {
        username: Date.now().toString(),
        password: mockPassword
      })

      assert.strictEqual(success, false)
    })

    it('fails when the password is wrong', async () => {
      const { success } = await signInHandler(undefined!, {
        username: mockUsername,
        password: Date.now().toString()
      })

      assert.strictEqual(success, false)
    })

    it('returns the account and stores it in global context when credentials are correct', async () => {
      const { success, account } = await signInHandler(undefined!, {
        username: mockUsername,
        password: mockPassword
      })

      assert.strictEqual(mockGlobalContext.session?.account, mockAccount)
      assert.strictEqual(account, mockAccount)
      assert.strictEqual(success, true)
    })
  })

  describe.todo('signOut')
})
