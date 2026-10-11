/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node harness uses JavaScript. */
// Verifies the development demo setup and role-based access: demo accounts sign in, each role gets
// its own dashboard data, unauthorized IPC calls are rejected, and the sample data reconciles.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const setupScript = fileURLToPath(new URL('./demo-setup.mjs', import.meta.url))

if (!process.env.ROLES_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-roles-test-'))
  const run = (...args) =>
    spawnSync(process.execPath, [setupScript, 'setup', ...args], { encoding: 'utf8' })
  try {
    const database = join(directory, 'demo.db')
    const options = ['--database', database, '--user-data', join(directory, 'user-data')]
    const first = run(...options)
    assert.equal(first.status, 0, first.stderr)
    const second = run(...options)
    assert.equal(second.status, 0, second.stderr)
    assert.match(second.stdout, /already set up/)
    const { default: SQLite } = await import('better-sqlite3')
    const other = join(directory, 'other.db')
    const existing = new SQLite(other)
    existing.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, username TEXT)')
    existing.prepare('INSERT INTO accounts (username) VALUES (?)').run('real.user')
    existing.close()
    const refused = run('--database', other, '--user-data', join(directory, 'user-data'))
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /Refusing to seed/)
    const untouched = new SQLite(other, { readonly: true })
    assert.deepEqual(untouched.prepare('SELECT username FROM accounts').all(), [
      { username: 'real.user' }
    ])
    untouched.close()
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
          ROLES_TEST_PHASE: '1',
          DATABASE: database,
          DATABASE_BACKUP: join(directory, 'backup.db'),
          INVENTORY_TEST_USER_DATA: join(directory, 'user-data')
        }
      }
    )
    assert.equal(child.status, 0, 'role checks failed')
    console.log('PASS: demo setup is repeatable and refuses databases with existing records')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  const { canAccessPath, getHomePath } = await import('../src/renderer/src/navigation/access.ts')
  const { demoAccounts } = await import('./demo-setup.mjs')
  for (const module of [
    'auth',
    'account',
    'dashboard',
    'supplier',
    'product',
    'customer',
    'purchase-order',
    'procurement',
    'sales',
    'wholesale',
    'reporting',
    'administration',
    'inventory'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, `${channel}: ${result.error}`)
    return result
  }
  const denied = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, `${channel} should be denied`)
  }
  const [admin, staff, cashier] = demoAccounts
  const credentials = ({ username, password }) => ({ username, password })
  const { localDate } = await import('../src/shared/inventory.ts')
  const report = { kind: 'inventory', from: localDate(), to: localDate(), search: '', page: 1 }
  try {
    // Sign-in: valid demo accounts work, the blocked account and wrong passwords do not.
    assert.equal(
      (await invoke(channels.auth.signIn, { username: 'demo.blocked', password: 'x' })).success,
      false
    )
    await denied(channels.auth.signIn, { username: admin.username, password: 'WrongPassword1' })
    await denied(channels.dashboard.get)

    await ok(channels.auth.signIn, credentials(admin))
    const adminView = (await ok(channels.dashboard.get)).data
    assert.equal(adminView.view, 'admin')
    assert.ok(adminView.operationsPulse.some((item) => item.id === 'stock-valuation'))
    assert.equal(adminView.recentTransactions.length, 4)
    await ok(channels.account.getAll)
    await ok(channels.reporting.generate, report)
    const valuation = adminView.operationsPulse.find((item) => item.id === 'stock-valuation')
    const batches = await db.selectFrom('batches').selectAll().execute()
    // Note: Valuation is computed live from batch stock at purchase cost; recompute it here.
    const expected = batches.reduce((sum, batch) => sum + batch.currentStock * batch.buyPrice, 0)
    assert.ok(expected > 0)
    assert.equal(Math.round(valuation.value * 100), Math.round(expected * 100))
    await ok(channels.auth.signOut)

    await ok(channels.auth.signIn, credentials(staff))
    const staffView = (await ok(channels.dashboard.get)).data
    assert.equal(staffView.view, 'staff')
    assert.equal(staffView.recentTransactions.length, 0)
    assert.ok(!staffView.summaryMetrics.some((metric) => metric.id === 'daily-sales'))
    assert.equal(
      staffView.summaryMetrics.find((metric) => metric.id === 'awaiting-delivery').value,
      1
    )
    assert.ok(staffView.expiryAlerts.some((alert) => alert.expiryStatus === 'expired'))
    assert.ok(staffView.expiryAlerts.some((alert) => alert.expiryStatus !== 'expired'))
    assert.ok(staffView.lowStockAlerts.length >= 2)
    await ok(channels.purchaseOrder.getAll)
    await ok(channels.supplier.getAll)
    for (const channel of [
      channels.account.getAll,
      channels.reporting.generate,
      channels.administration.backups
    ])
      await denied(channel, report)
    await ok(channels.auth.signOut)

    await ok(channels.auth.signIn, credentials(cashier))
    const cashierView = (await ok(channels.dashboard.get)).data
    assert.equal(cashierView.view, 'cashier')
    assert.equal(cashierView.operationsPulse.length, 0)
    assert.equal(cashierView.expiryAlerts.length, 0)
    assert.equal(cashierView.recentTransactions.length, 4)
    const ownSales = await db
      .selectFrom('sales')
      .select(({ fn }) => fn.sum('totalCents').as('total'))
      .where('cashierId', '=', state.session.account.id)
      .executeTakeFirstOrThrow()
    assert.equal(
      Math.round(
        cashierView.summaryMetrics.find((metric) => metric.id === 'daily-sales').value * 100
      ),
      Number(ownSales.total)
    )
    await ok(channels.sales.history)
    await ok(channels.product.getAll)
    for (const channel of [
      channels.purchaseOrder.getAll,
      channels.supplier.getAll,
      channels.procurement.getRecords,
      channels.account.getAll,
      channels.reporting.generate,
      channels.wholesale.list,
      channels.administration.backups,
      channels.inventory.getStockOuts
    ])
      await denied(channel, channel === channels.reporting.generate ? report : {})
    await denied(channels.supplier.createOne, {})
    await denied(channels.product.removeOneById, 1)
    await ok(channels.auth.signOut)
    await denied(channels.dashboard.get)

    // Route rules used by the renderer guard.
    for (const role of ['master', 'staff', 'cashier']) assert.equal(getHomePath(role), '/')
    assert.equal(canAccessPath('cashier', '/'), true)
    assert.equal(canAccessPath('cashier', '/suppliers'), false)
    assert.equal(canAccessPath('cashier', '/inventory'), false)
    assert.equal(canAccessPath('cashier', '/users'), false)
    assert.equal(canAccessPath('staff', '/suppliers'), true)
    assert.equal(canAccessPath('staff', '/users'), false)
    assert.equal(canAccessPath('staff', '/reports'), false)
    assert.equal(canAccessPath('master', '/users'), true)

    // Sample data reconciles: batch stock = received - sold - wholesale delivered.
    for (const batch of batches) {
      const received = await db
        .selectFrom('supplierDeliveryItems')
        .select(({ fn }) => fn.sum('quantity').as('quantity'))
        .where('batchId', '=', batch.id)
        .executeTakeFirstOrThrow()
      const sold = await db
        .selectFrom('saleItems')
        .select(({ fn }) => fn.sum('quantity').as('quantity'))
        .where('batchId', '=', batch.id)
        .executeTakeFirstOrThrow()
      const wholesale = await db
        .selectFrom('wholesaleOrderItems')
        .innerJoin('wholesaleOrders', 'wholesaleOrders.id', 'wholesaleOrderItems.orderId')
        .select(({ fn }) => fn.sum('wholesaleOrderItems.quantity').as('quantity'))
        .where('wholesaleOrderItems.batchId', '=', batch.id)
        .where('wholesaleOrders.status', '=', 'delivered')
        .executeTakeFirstOrThrow()
      assert.equal(
        batch.currentStock,
        Number(received.quantity ?? 0) -
          Number(sold.quantity ?? 0) -
          Number(wholesale.quantity ?? 0),
        `batch ${batch.physicalTag}`
      )
    }
    const statuses = (await db.selectFrom('purchaseOrders').select('status').execute())
      .map((order) => order.status)
      .sort()
    assert.deepEqual(statuses, ['cancelled', 'draft', 'partially_received', 'received', 'received'])
    console.log('PASS: demo accounts, role dashboards, protected IPC and data reconciliation')
  } finally {
    await db.destroy()
  }
}
