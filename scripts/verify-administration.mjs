/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.ADMIN_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-admin-test-'))
  try {
    for (const phase of ['workflow', 'restart']) {
      const child = spawnSync(
        process.execPath,
        [
          '--experimental-loader',
          new URL('./inventory-test-loader.mjs', import.meta.url).href,
          fileURLToPath(import.meta.url)
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            ADMIN_TEST_PHASE: phase,
            DATABASE: join(directory, 'admin.db'),
            INVENTORY_TEST_USER_DATA: directory
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-admin-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db, database } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { LOGIN_MAX_ATTEMPTS } = await import('../src/shared/security.ts')
  const { handlers, dialog } = await import('./inventory-test-electron.mjs')
  const { validateBackup, restoreBackup, invoiceDirectory } =
    await import('../src/main/backup/local.ts')
  const { verify } = await import('argon2')
  const { default: SQLite } = await import('better-sqlite3')
  for (const module of [
    'setup',
    'auth',
    'account',
    'administration',
    'product',
    'customer',
    'inventory',
    'sales',
    'wholesale',
    'procurement',
    'purchase-order',
    'reporting'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, JSON.stringify(result))
    return result
  }
  const bad = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, JSON.stringify(result))
    return result
  }
  const account = (username) =>
    db.selectFrom('accounts').selectAll().where('username', '=', username).executeTakeFirstOrThrow()
  const login = (username = 'audit-admin', password = 'SecurePass123') =>
    ok(channels.auth.signIn, { username, password })
  const safe = (value) => {
    for (const key of ['password', 'failedAttempts', 'lockedUntil', 'lastFailedAt'])
      assert.equal(key in value, false)
  }
  const root = process.env.INVENTORY_TEST_USER_DATA
  try {
    if (process.env.ADMIN_TEST_PHASE === 'restart') {
      assert.equal((await ok(channels.auth.getStatus)).account, null)
      await bad(channels.account.getAll)
      await bad(channels.auth.signIn, { username: 'audit-staff', password: 'ChangedPass123' })
      assert.equal((await account('audit-staff')).failedAttempts, LOGIN_MAX_ATTEMPTS)
      await login()
      assert.equal((await account('audit-admin')).fullName, 'Audit Admin')
      const invoice = await db.selectFrom('supplierInvoices').selectAll().executeTakeFirstOrThrow()
      assert.equal(
        await readFile(join(invoiceDirectory(), invoice.storedFilename), 'utf8'),
        '%PDF-test supplier invoice'
      )
      await ok(channels.procurement.openInvoice, invoice.id)
      assert.ok((await ok(channels.administration.backups)).backups.length >= 1)
      assert.ok(
        (await ok(channels.administration.logs, { search: 'restore' })).records.some(
          (row) => row.result === 'success'
        )
      )
      console.log(
        'PASS: separate-process restart, persisted accounts/lockout/audit/invoice retrieval, repeat migrations'
      )
    } else {
      assert.equal((await ok(channels.setup.getStatus)).requiresSetup, true)
      const admin = (
        await ok(channels.setup.createMaster, {
          fullName: 'Audit Admin',
          username: 'audit-admin',
          password: 'SecurePass123'
        })
      ).account
      safe(admin)
      await bad(channels.setup.createMaster, {
        fullName: 'Second Admin',
        username: 'other-admin',
        password: 'SecurePass123'
      })
      const input = {
        fullName: 'Audit Staff',
        username: 'audit-staff',
        password: 'SecurePass123',
        role: 'staff'
      }
      const staff = (await ok(channels.account.createOne, input)).account
      safe(staff)
      assert.ok(await verify((await account(input.username)).password, input.password))
      await bad(channels.account.createOne, input)
      await bad(channels.account.createOne, { ...input, username: 'different', role: 'superuser' })
      await bad(channels.account.createOne, { ...input, username: '', password: 'short' })
      await bad(channels.account.createOne, { ...input, username: 'newmaster', role: 'master' })
      await bad(channels.account.updateOneById, admin.id, { role: 'staff' })
      await bad(channels.account.setBlockedById, admin.id, true)
      await bad(channels.account.removeOneById, admin.id)
      await ok(channels.account.updateOneById, staff.id, { role: 'cashier' })
      assert.equal((await account(input.username)).role, 'cashier')
      await ok(channels.account.updateOneById, staff.id, { role: 'staff' })
      await ok(channels.account.setBlockedById, staff.id, true)
      assert.match(
        (await bad(channels.auth.signIn, { username: input.username, password: input.password }))
          .error,
        /blocked/i
      )
      await login()
      await ok(channels.account.setBlockedById, staff.id, false)
      await login(input.username)
      safe((await ok(channels.auth.getStatus)).account)
      for (const [channel, args] of [
        [channels.account.getAll, []],
        [channels.account.createOne, [input]],
        [channels.account.updateOneById, [staff.id, { role: 'master' }]],
        [channels.account.setBlockedById, [admin.id, true]],
        [channels.account.removeOneById, [admin.id]],
        [channels.administration.logs, [{ search: '' }]],
        [channels.administration.permissions, []],
        [channels.administration.backup, []],
        [channels.administration.restore, []],
        [channels.administration.backups, []]
      ])
        await bad(channel, ...args)
      const profile = {
        fullName: 'Updated Staff',
        username: input.username,
        currentPassword: input.password,
        password: 'ChangedPass123'
      }
      await bad(channels.account.updateProfile, { ...profile, role: 'master' })
      await bad(channels.account.updateProfile, { ...profile, isArchived: 0 })
      await bad(channels.account.updateProfile, { ...profile, currentPassword: 'IncorrectPass' })
      await ok(channels.account.updateProfile, profile)
      assert.equal(state.session, undefined)
      await bad(channels.account.getAll)
      await login(input.username, profile.password)
      assert.equal((await account(input.username)).fullName, 'Updated Staff')
      assert.equal((await account(input.username)).role, 'staff')
      // A renderer/cached role cannot grant administrator permissions.
      state.session.account.role = 'master'
      await bad(channels.account.getAll)
      await db.updateTable('accounts').set({ isArchived: 1 }).where('id', '=', staff.id).execute()
      await bad(channels.product.getAll)
      assert.equal(state.session, undefined)
      assert.match(
        (await bad(channels.auth.signIn, { username: input.username, password: profile.password }))
          .error,
        /blocked/i
      )
      await login()
      await ok(channels.account.setBlockedById, staff.id, false)
      await db.updateTable('accounts').set({ isVerified: 0 }).where('id', '=', staff.id).execute()
      assert.match(
        (await bad(channels.auth.signIn, { username: input.username, password: profile.password }))
          .error,
        /verified/i
      )
      await db.updateTable('accounts').set({ isVerified: 1 }).where('id', '=', staff.id).execute()
      const wrong = await bad(channels.auth.signIn, { username: input.username, password: 'bad' })
      const missing = await bad(channels.auth.signIn, {
        username: 'no-such-user',
        password: 'WrongPassword'
      })
      assert.equal(wrong.error, missing.error)
      for (let i = 1; i < LOGIN_MAX_ATTEMPTS; i++)
        await bad(channels.auth.signIn, { username: input.username, password: 'WrongPassword' })
      assert.equal((await account(input.username)).failedAttempts, LOGIN_MAX_ATTEMPTS)
      assert.match(
        (await bad(channels.auth.signIn, { username: input.username, password: profile.password }))
          .error,
        /one minute/i
      )
      await login()
      assert.ok(
        (await ok(channels.account.getAll)).accounts.find((row) => row.id === staff.id).lockedUntil
      )
      assert.ok((await ok(channels.administration.logs, { search: 'auth.locked' })).records.length)
      await db
        .updateTable('accounts')
        .set({ lockedUntil: new Date(Date.now() - 1000).toISOString() })
        .where('id', '=', staff.id)
        .execute()
      await login(input.username, profile.password)
      assert.equal((await account(input.username)).failedAttempts, 0)
      await ok(channels.auth.signOut)
      assert.equal((await ok(channels.auth.getStatus)).account, null)
      await bad(channels.product.getAll)
      await login()
      const prepare = database.prepare
      database.prepare = function (statement) {
        if (statement.includes('"audit_logs"')) throw new Error('Injected audit failure')
        return prepare.call(this, statement)
      }
      try {
        await ok(channels.auth.signOut)
      } finally {
        database.prepare = prepare
      }
      assert.equal(state.session, undefined)
      await login()
      const disposable = (
        await ok(channels.account.createOne, { ...input, username: 'delete-user' })
      ).account
      await ok(channels.account.removeOneById, disposable.id)
      assert.ok(
        (await ok(channels.administration.logs, { search: 'account.remove' })).records.some(
          (row) => row.targetId === disposable.id
        )
      )
      assert.ok((await ok(channels.administration.permissions)).grants.master)
      console.log(
        'PASS: setup, account CRUD/roles, secure profiles, fresh authorization, blocked/unverified users, login/logout and durable lockout'
      )

      // Real invoice metadata and stored file participate in the backup, not UI state.
      const supplier = await db
        .insertInto('suppliers')
        .values({
          organization: 'Audit Supplier',
          person: 'Test Person',
          phone: '09123456789',
          telephone: null,
          email: null,
          street: 'Test Street',
          city: 'Test City',
          province: 'Test Province',
          country: 'Philippines',
          postalCode: '1000'
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const po = await db
        .insertInto('purchaseOrders')
        .values({
          supplierId: supplier.id,
          orderNumber: 'BACKUP-PO',
          status: 'draft',
          orderedAt: '2026-09-01',
          expectedAt: null,
          receivedAt: null,
          notes: null,
          totalAmount: 100,
          createdBy: admin.id
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await mkdir(invoiceDirectory(), { recursive: true })
      await writeFile(join(invoiceDirectory(), 'backup-test.pdf'), '%PDF-test supplier invoice')
      const invoice = await db
        .insertInto('supplierInvoices')
        .values({
          supplierId: supplier.id,
          purchaseOrderId: po.id,
          invoiceNumber: 'BACKUP-INVOICE',
          invoiceDate: '2026-09-01',
          dueDate: '2026-10-01',
          amount: 100,
          status: 'unpaid',
          originalFilename: 'supplier.pdf',
          storedFilename: 'backup-test.pdf',
          mimeType: 'application/pdf',
          fileSize: 26,
          uploadedBy: admin.id
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const destination = join(root, 'chosen-backups')
      await mkdir(destination)
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] })
      const backup = (await ok(channels.administration.backup)).backup
      assert.equal((await validateBackup(backup.directory)).invoiceCount, 1)
      await db
        .updateTable('accounts')
        .set({ fullName: 'Changed After Backup' })
        .where('id', '=', admin.id)
        .execute()
      await writeFile(join(invoiceDirectory(), 'backup-test.pdf'), 'modified invoice')
      await ok(channels.account.createOne, { ...input, username: 'after-backup' })
      const afterEvent = await db
        .selectFrom('auditLogs')
        .selectAll()
        .orderBy('id', 'desc')
        .executeTakeFirstOrThrow()
      const corrupt = join(root, 'corrupt-backup')
      await cp(backup.directory, corrupt, { recursive: true })
      await writeFile(join(corrupt, 'database.sqlite'), 'not a database')
      await assert.rejects(validateBackup(corrupt))
      const manifest = JSON.parse(await readFile(join(corrupt, 'manifest.json'), 'utf8'))
      manifest.database = createHash('sha256').update('not a database').digest('hex')
      await writeFile(join(corrupt, 'manifest.json'), JSON.stringify(manifest))
      await assert.rejects(validateBackup(corrupt))
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [join(corrupt, 'manifest.json')]
      })
      await bad(channels.administration.restore)
      assert.equal((await account('audit-admin')).fullName, 'Changed After Backup')
      // Inject a write failure midway through restore to verify transaction rollback.
      const originalExec = database.exec
      database.exec = function (statement) {
        if (statement.startsWith('INSERT INTO main."suppliers"'))
          throw new Error('Injected restore failure')
        return originalExec.call(this, statement)
      }
      try {
        await assert.rejects(restoreBackup(backup.directory), /Injected restore failure/)
      } finally {
        database.exec = originalExec
      }
      assert.equal((await account('audit-admin')).fullName, 'Changed After Backup')
      assert.equal(
        await readFile(join(invoiceDirectory(), 'backup-test.pdf'), 'utf8'),
        'modified invoice'
      )
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [join(backup.directory, 'manifest.json')]
      })
      dialog.showMessageBox = async () => ({ response: 0 })
      assert.equal((await ok(channels.administration.restore)).cancelled, true)
      dialog.showMessageBox = async () => ({ response: 1 })
      const restored = await ok(channels.administration.restore)
      assert.equal(restored.reloadRequired, true)
      assert.equal(state.session, undefined)
      await bad(channels.account.getAll)
      assert.equal((await account('audit-admin')).fullName, 'Audit Admin')
      assert.equal(
        await db
          .selectFrom('accounts')
          .selectAll()
          .where('username', '=', 'after-backup')
          .executeTakeFirst(),
        undefined
      )
      assert.ok(
        await db
          .selectFrom('auditLogs')
          .selectAll()
          .where('eventId', '=', afterEvent.eventId)
          .executeTakeFirst()
      )
      assert.equal(
        await readFile(join(invoiceDirectory(), 'backup-test.pdf'), 'utf8'),
        '%PDF-test supplier invoice'
      )
      const safety = new SQLite(join(restored.safety.directory, 'database.sqlite'), {
        readonly: true
      })
      assert.equal(
        safety.prepare('SELECT full_name FROM accounts WHERE id = ?').get(admin.id).full_name,
        'Changed After Backup'
      )
      safety.close()
      await login()
      await ok(channels.procurement.openInvoice, invoice.id)
      await ok(channels.account.createOne, { ...input, username: 'post-restore' })
      const audit = JSON.stringify(await db.selectFrom('auditLogs').selectAll().execute())
      for (const secret of ['SecurePass123', 'ChangedPass123', 'WrongPassword', '$argon2'])
        assert.equal(audit.includes(secret), false)
      for (const action of [
        'auth.signIn',
        'auth.signOut',
        'account.roleChanged',
        'account.unblocked',
        'account.updateProfile',
        'administration.restore'
      ])
        assert.ok(audit.includes(action), action)
      await db
        .updateTable('accounts')
        .set({
          failedAttempts: LOGIN_MAX_ATTEMPTS,
          lastFailedAt: new Date().toISOString(),
          lockedUntil: new Date(Date.now() + 3600000).toISOString()
        })
        .where('id', '=', staff.id)
        .execute()
      console.log(
        'PASS: full SQLite/invoice backup, checksums/corruption rejection, cancel, rollback, safety backup, restore/sign-out, retained audit and post-restore operations'
      )
    }
    assert.deepEqual(database.pragma('foreign_key_check'), [])
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok')
    assert.equal(database.pragma('foreign_keys', { simple: true }), 1)
    console.log('PASS: database integrity and foreign keys')
  } finally {
    await db.destroy()
  }
}
