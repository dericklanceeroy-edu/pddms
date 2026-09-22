/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.SALES_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-sales-test-'))
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
            SALES_TEST_PHASE: phase,
            DATABASE: join(directory, 'sales.db'),
            INVENTORY_TEST_EXPORT: join(directory, 'receipt.txt')
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-sales-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { handlers, dialog } = await import('./inventory-test-electron.mjs')
  const { calculateSale, customerDiscount, receiptText, setCartQuantity, removeCartItem } =
    await import('../src/shared/sales.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { sql } = await import('kysely')
  await import('../src/main/sales/controller.ts')
  await import('../src/main/product/controller.ts')
  await import('../src/main/customer/controller.ts')
  await import('../src/main/purchase-order/controller.ts')
  await import('../src/main/auth/controller.ts')
  await initializeDatabase()
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, result.error)
    return result
  }
  const bad = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, JSON.stringify(result))
    return result
  }
  const snapshot = async () => ({
    sales: await db.selectFrom('sales').selectAll().execute(),
    lines: await db.selectFrom('saleItems').selectAll().execute(),
    batches: await db.selectFrom('batches').selectAll().execute(),
    movements: await db.selectFrom('stockOuts').selectAll().execute()
  })
  try {
    if (process.env.SALES_TEST_PHASE === 'restart') {
      state.session = {
        account: await db
          .selectFrom('accounts')
          .selectAll()
          .where('role', '=', 'master')
          .executeTakeFirstOrThrow()
      }
      const records = (await ok(channels.sales.history)).records
      assert.equal(records.length, 4)
      const sale = (await ok(channels.sales.getOne, records.at(-1).id)).sale
      assert.equal(sale.totalCents, 24000)
      assert.equal(receiptText(sale), await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8'))
      assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
      assert.equal((await sql`PRAGMA integrity_check`.execute(db)).rows[0].integrityCheck, 'ok')
      const batches = await db.selectFrom('batches').selectAll().execute()
      const movement = await db.selectFrom('stockOuts').selectAll().execute()
      for (const batch of batches)
        assert.equal(
          batch.initialStock - batch.currentStock,
          movement
            .filter((item) => item.batchId === batch.id)
            .reduce((sum, item) => sum + item.quantity, 0)
        )
      console.log(
        'PASS: second-process restart, repeat migrations, receipt snapshots, balances, foreign keys, stock audit reconciliation'
      )
    } else {
      const { hash } = await import('argon2')
      const password = await hash('SalesTest123')
      const admin = await db
        .insertInto('accounts')
        .values({ role: 'master', username: 'sales-admin', fullName: 'Sales Admin', password })
        .returningAll()
        .executeTakeFirstOrThrow()
      const cashier = await db
        .insertInto('accounts')
        .values({ role: 'cashier', username: 'sales-cashier', fullName: 'Sales Cashier', password })
        .returningAll()
        .executeTakeFirstOrThrow()
      const other = await db
        .insertInto('accounts')
        .values({ role: 'cashier', username: 'other-cashier', fullName: 'Other Cashier', password })
        .returningAll()
        .executeTakeFirstOrThrow()
      state.session = { account: admin }
      const supplier = await db
        .insertInto('suppliers')
        .values({
          organization: 'Test Supplier',
          person: 'Test Person',
          phone: '09170000000',
          telephone: null,
          email: null,
          street: 'Street',
          city: 'City',
          province: 'Province',
          country: 'Philippines',
          postalCode: '1000'
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const products = []
      for (const brandName of ['Medicine Alpha', 'Medicine Beta'])
        products.push(
          (
            await ok(channels.product.createOne, {
              brandName,
              genericName: 'Generic',
              formulation: '500 mg tablet',
              category: 'Medicine',
              isPrescribed: false,
              isControlled: false,
              reorderLevel: 5
            })
          ).product
        )
      const order = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: products.map((product) => ({ drugId: product.id, quantity: 20, unitCost: 80 }))
        })
      ).order
      await ok(channels.purchaseOrder.updateStatusById, order.id, { status: 'submitted' })
      await ok(channels.purchaseOrder.recordDeliveryById, order.id, {
        deliveredAt: localDate(),
        items: order.items.map((item, index) => ({
          itemId: item.id,
          receivedQuantity: 20,
          batchNumber: `SALES-BATCH-${index}`,
          sellPrice: 112,
          expiresAt: '2099-01-01'
        }))
      })
      const batches = await db.selectFrom('batches').selectAll().orderBy('id').execute()
      const senior = await db
        .insertInto('customers')
        .values({
          fullName: 'Senior Customer',
          phone: '09171234567',
          email: null,
          address: null,
          discountType: 'senior',
          discountId: 'SC-001',
          discountExpiresAt: '2099-01-01'
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const regular = await db
        .insertInto('customers')
        .values({
          fullName: 'Regular Customer',
          phone: '09171234568',
          email: null,
          address: null,
          discountType: 'none',
          discountId: null,
          discountExpiresAt: null
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const line = { batchId: batches[0].id, quantity: 1, unitPriceCents: 11200 }
      let cart = setCartQuantity([], line, 20)
      cart = setCartQuantity(cart, { ...line, quantity: 2 }, 20)
      assert.equal(cart.length, 1)
      cart = setCartQuantity(cart, { ...line, batchId: batches[1].id }, 20)
      assert.equal(calculateSale(cart, 'none').totalCents, 33600)
      assert.equal(calculateSale(cart, 'senior').totalCents, 24000)
      assert.equal(calculateSale(cart, 'pwd').vatExemptionCents, 3600)
      assert.deepEqual(
        calculateSale(
          [
            { ...line, quantity: 3, unitPriceCents: 125 },
            { ...line, batchId: batches[1].id, quantity: 2, unitPriceCents: 239 }
          ],
          'senior'
        ),
        {
          subtotalCents: 853,
          vatExemptionCents: 91,
          discountCents: 152,
          totalCents: 610,
          discountType: 'senior'
        }
      )
      assert.equal(customerDiscount(regular), 'none')
      assert.throws(() => customerDiscount({ ...senior, discountId: '' }))
      assert.throws(() => customerDiscount({ ...senior, discountExpiresAt: '2000-01-01' }))
      assert.throws(() => customerDiscount({ ...senior, discountExpiresAt: 'invalid' }))
      for (const quantity of [0, -1, 1.5, 21])
        assert.throws(() => setCartQuantity(cart, { ...line, quantity }, 20))
      const beforeCart = await snapshot()
      const removed = removeCartItem(cart, line.batchId)
      assert.equal(removed.length, 1)
      assert.equal(calculateSale(removed, 'none').totalCents, 11200)
      const cancelled = []
      assert.equal(calculateSale(cancelled, 'none').totalCents, 0)
      assert.deepEqual(await snapshot(), beforeCart)
      await ok(channels.auth.signOut)
      await bad(channels.sales.history)
      const request = {
        requestId: randomUUID(),
        customerId: senior.id,
        items: cart,
        expectedTotalCents: 24000,
        cashCents: 30000
      }
      await bad(channels.sales.checkout, request)
      await ok(channels.auth.signIn, { username: cashier.username, password: 'SalesTest123' })
      assert.equal((await ok(channels.sales.quote, requestDraft(request))).totals.totalCents, 24000)
      const unchanged = await snapshot()
      for (const values of [
        { cashCents: -1 },
        { cashCents: 0 },
        { cashCents: 23999 },
        { cashCents: 30000.5 },
        { items: [] },
        { customerId: 999999 },
        { expectedTotalCents: 1 },
        { items: [line, line] },
        { items: [{ ...line, quantity: 0 }] },
        { items: [{ ...line, quantity: 21 }] },
        { items: [{ ...line, batchId: 999999 }] },
        { items: [{ ...line, unitPriceCents: 1 }] },
        { discountType: 'senior' }
      ])
        await bad(channels.sales.checkout, { ...request, ...values })
      assert.deepEqual(await snapshot(), unchanged)
      await db
        .updateTable('customers')
        .set({ discountExpiresAt: '2000-01-01' })
        .where('id', '=', senior.id)
        .execute()
      await bad(channels.sales.checkout, request)
      await db
        .updateTable('customers')
        .set({ discountExpiresAt: '2099-01-01' })
        .where('id', '=', senior.id)
        .execute()
      await db
        .updateTable('batches')
        .set({ sellPrice: 113 })
        .where('id', '=', line.batchId)
        .execute()
      await bad(channels.sales.checkout, request)
      await db
        .updateTable('batches')
        .set({ sellPrice: 112 })
        .where('id', '=', line.batchId)
        .execute()
      await db
        .updateTable('batches')
        .set({ expiresAt: '2000-01-01' })
        .where('id', '=', line.batchId)
        .execute()
      await bad(channels.sales.checkout, request)
      await db
        .updateTable('batches')
        .set({ expiresAt: '2099-01-01' })
        .where('id', '=', line.batchId)
        .execute()
      await sql`CREATE TRIGGER sales_test_failure BEFORE INSERT ON sale_items WHEN NEW.batch_id = ${sql.lit(batches[1].id)} BEGIN SELECT RAISE(ABORT, 'injected failure'); END`.execute(
        db
      )
      await bad(channels.sales.checkout, request)
      assert.deepEqual(await snapshot(), unchanged)
      await sql`DROP TRIGGER sales_test_failure`.execute(db)
      const sale = (await ok(channels.sales.checkout, request)).sale
      assert.equal(
        (await ok(channels.customer.getAll)).customers.find((customer) => customer.id === senior.id)
          .transactions[0].total,
        240
      )
      const { getAdminDashboard } = await import('../src/main/dashboard/repository.ts')
      const dashboard = await getAdminDashboard()
      assert.equal(
        dashboard.summaryMetrics.find((metric) => metric.id === 'daily-sales').value,
        240
      )
      assert.equal(dashboard.summaryMetrics.find((metric) => metric.id === 'items-sold').value, 3)
      assert.equal(dashboard.recentTransactions[0].amount, 240)
      assert.equal(sale.changeCents, 6000)
      assert.equal(sale.items.length, 2)
      assert.equal((await ok(channels.sales.checkout, request)).sale.id, sale.id)
      await bad(channels.sales.checkout, { ...request, cashCents: 40000 })
      assert.equal((await ok(channels.sales.history)).records.length, 1)
      await ok(channels.sales.exportReceipt, sale.id)
      assert.equal(await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8'), receiptText(sale))
      const originalDialog = dialog.showSaveDialog
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: join(process.env.INVENTORY_TEST_EXPORT, 'invalid.txt')
      })
      await bad(channels.sales.exportReceipt, sale.id)
      assert.equal((await ok(channels.sales.getOne, sale.id)).sale.totalCents, 24000)
      dialog.showSaveDialog = originalDialog
      await db
        .updateTable('drugs')
        .set({ brandName: 'Renamed Medicine' })
        .where('id', '=', products[0].id)
        .execute()
      assert.ok(
        (await ok(channels.sales.getOne, sale.id)).sale.items[0].productName.includes(
          'Medicine Alpha'
        )
      )
      const exact = {
        requestId: randomUUID(),
        customerId: regular.id,
        items: [line],
        expectedTotalCents: 11200,
        cashCents: 11200
      }
      assert.equal((await ok(channels.sales.checkout, exact)).sale.changeCents, 0)
      await db
        .updateTable('customers')
        .set({ discountType: 'pwd' })
        .where('id', '=', senior.id)
        .execute()
      const pwd = {
        ...exact,
        requestId: randomUUID(),
        customerId: senior.id,
        expectedTotalCents: 8000
      }
      assert.equal((await ok(channels.sales.checkout, pwd)).sale.discountType, 'pwd')
      const remaining = (
        await db
          .selectFrom('batches')
          .select('currentStock')
          .where('id', '=', line.batchId)
          .executeTakeFirstOrThrow()
      ).currentStock
      const concurrent = {
        ...exact,
        items: [{ ...line, quantity: remaining }],
        expectedTotalCents: remaining * 11200,
        cashCents: remaining * 11200
      }
      const outcomes = await Promise.all([
        invoke(channels.sales.checkout, { ...concurrent, requestId: randomUUID() }),
        invoke(channels.sales.checkout, { ...concurrent, requestId: randomUUID() })
      ])
      assert.equal(outcomes.filter((result) => result.success).length, 1)
      assert.equal(
        (
          await db
            .selectFrom('batches')
            .select('currentStock')
            .where('id', '=', line.batchId)
            .executeTakeFirstOrThrow()
        ).currentStock,
        0
      )
      state.session = { account: other }
      assert.equal(
        (await ok(channels.customer.getAll)).customers.find((customer) => customer.id === senior.id)
          .transactions.length,
        0
      )
      assert.equal((await ok(channels.sales.history)).records.length, 0)
      await bad(channels.sales.getOne, sale.id)
      await bad(channels.sales.exportReceipt, sale.id)
      state.session = { account: admin }
      assert.equal((await ok(channels.sales.history)).records.length, 4)
      assert.equal((await ok(channels.sales.history, sale.id)).records.length, 0)
      state.session = { account: cashier }
      await db.updateTable('accounts').set({ isArchived: 1 }).where('id', '=', cashier.id).execute()
      await bad(channels.sales.history)
      await bad(channels.sales.checkout, { ...exact, requestId: randomUUID() })
      const { createElement } = await import('react')
      const { renderToStaticMarkup } = await import('react-dom/server')
      const { Receipt } = await import('../src/renderer/src/components/sales/SalesWorkspace.tsx')
      assert.ok(
        renderToStaticMarkup(createElement(Receipt, { sale, close: () => {} })).includes(
          'Completed sale'
        )
      )
      console.log(
        'PASS: login, cart edits/cancel, Senior/PWD math, invalid checkout, atomic rollback, receipt/export failure, idempotency, concurrent oversell, history authorization, blocked session, receipt rendering'
      )
    }
  } finally {
    await db.destroy()
  }
}
function requestDraft(request) {
  return { customerId: request.customerId, items: request.items }
}
