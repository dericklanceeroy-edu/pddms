/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.WHOLESALE_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-wholesale-test-'))
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
            WHOLESALE_TEST_PHASE: phase,
            DATABASE: join(directory, 'wholesale.db'),
            INVENTORY_TEST_EXPORT: join(directory, 'delivery.txt')
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-wholesale-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { deliveryReceiptText, receivable } = await import('../src/shared/wholesale.ts')
  const { canAccessPath } = await import('../src/renderer/src/navigation/access.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  const { sql } = await import('kysely')
  await import('../src/main/wholesale/controller.ts')
  await import('../src/main/product/controller.ts')
  await import('../src/main/purchase-order/controller.ts')
  await initializeDatabase()
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, result.error)
    return result.data === undefined ? result : result.data
  }
  const bad = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, JSON.stringify(result))
    return result
  }
  const stock = () => db.selectFrom('batches').selectAll().orderBy('id').execute()
  const snapshot = async () => ({
    stock: await stock(),
    orders: await db.selectFrom('wholesaleOrders').selectAll().orderBy('id').execute(),
    items: await db.selectFrom('wholesaleOrderItems').selectAll().orderBy('id').execute(),
    movements: await db.selectFrom('stockOuts').selectAll().orderBy('id').execute(),
    payments: await db.selectFrom('wholesalePayments').selectAll().orderBy('id').execute()
  })
  try {
    if (process.env.WHOLESALE_TEST_PHASE === 'restart') {
      const admin = await db
        .selectFrom('accounts')
        .selectAll()
        .where('role', '=', 'master')
        .executeTakeFirstOrThrow()
      state.session = { account: admin }
      const records = await ok(channels.wholesale.list, {})
      assert.equal(records.length, 6)
      const delivered = await ok(channels.wholesale.get, records.at(-1).id)
      assert.equal(delivered.status, 'delivered')
      assert.equal(delivered.receivable.remainingCents, 0)
      assert.equal(delivered.payments.length, 2)
      assert.equal(delivered.scheduledDate, localDate())
      assert.equal(delivered.deliveryAddress, 'Updated delivery address')
      assert.equal(
        deliveryReceiptText(delivered),
        await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8')
      )
      assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
      assert.equal((await sql`PRAGMA integrity_check`.execute(db)).rows[0].integrityCheck, 'ok')
      const movements = await db.selectFrom('stockOuts').selectAll().execute()
      for (const batch of await stock())
        assert.equal(
          batch.initialStock - batch.currentStock,
          movements
            .filter((item) => item.batchId === batch.id)
            .reduce((total, item) => total + item.quantity, 0)
        )
      console.log(
        'PASS: separate-process persistence, repeat migrations, order/schedule/payment/receipt snapshots, foreign keys, database integrity, stock reconciliation'
      )
    } else {
      const { hash } = await import('argon2')
      const password = await hash('WholesaleTest123')
      const accounts = []
      for (const role of ['master', 'staff', 'cashier'])
        accounts.push(
          await db
            .insertInto('accounts')
            .values({
              role,
              username: `test-${role}`,
              fullName: `Test ${role}`,
              password,
              isVerified: 1
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        )
      const [admin, staff, cashier] = accounts
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
      for (const brandName of ['Wholesale Alpha', 'Wholesale Beta'])
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
      const po = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: products.map((product) => ({ drugId: product.id, quantity: 20, unitCost: 80 }))
        })
      ).order
      await ok(channels.purchaseOrder.updateStatusById, po.id, { status: 'submitted' })
      await ok(channels.purchaseOrder.recordDeliveryById, po.id, {
        requestId: randomUUID(),
        deliveredAt: localDate(),
        items: po.items.map((item, index) => ({
          itemId: item.id,
          receivedQuantity: 20,
          batchNumber: `WHOLESALE-${index}`,
          sellPrice: 100,
          expiresAt: '2099-01-01'
        }))
      })
      const client = await db
        .insertInto('customers')
        .values({
          fullName: 'Wholesale Client',
          phone: '09171234567',
          email: null,
          address: 'Delivery address',
          discountType: 'none',
          discountId: null,
          discountExpiresAt: null
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const batches = await stock()
      const lines = batches.map((batch) => ({
        batchId: batch.id,
        quantity: 2,
        unitPriceCents: 10000
      }))
      const draft = {
        requestId: randomUUID(),
        customerId: client.id,
        dueDate: '2000-01-01',
        deliveryAddress: client.address,
        notes: 'Wholesale installment order',
        items: lines
      }
      const payment = (orderId, amountCents, reference = randomUUID()) => ({
        orderId,
        amountCents,
        reference,
        paidAt: localDate(),
        method: 'Cash',
        notes: ''
      })
      state.session = undefined
      await bad(channels.wholesale.list, {})
      await bad(channels.wholesale.create, draft)
      state.session = { account: cashier }
      for (const channel of Object.values(channels.wholesale)) await bad(channel, draft)
      assert.equal(canAccessPath('cashier', '/wholesale'), false)
      assert.equal(canAccessPath('staff', '/wholesale'), true)
      state.session = { account: staff }
      const before = await stock()
      const id = await ok(channels.wholesale.create, draft)
      assert.equal(await ok(channels.wholesale.create, draft), id)
      await bad(channels.wholesale.create, { ...draft, notes: 'Changed retry' })
      assert.deepEqual(await stock(), before)
      const order = await ok(channels.wholesale.get, id)
      assert.equal(order.totalCents, 40000)
      assert.equal(order.items.length, 2)
      assert.equal(order.receivable, undefined)
      assert.equal(order.payments, undefined)
      assert.equal(order.requestFingerprint, undefined)
      await bad(channels.wholesale.pay, payment(id, 10000))
      await bad(channels.wholesale.alerts)
      await bad(channels.wholesale.list, { overdue: true })
      for (const invalid of [
        { customerId: 9999 },
        { items: [] },
        { items: [lines[0], lines[0]] },
        { dueDate: '2026-02-30' },
        { items: [{ ...lines[0], quantity: 0 }] },
        { items: [{ ...lines[0], quantity: -1 }] },
        { items: [{ ...lines[0], quantity: 1.5 }] },
        { items: [{ ...lines[0], batchId: 9999 }] },
        { items: [{ ...lines[0], unitPriceCents: 1 }] }
      ])
        await bad(channels.wholesale.create, { ...draft, requestId: randomUUID(), ...invalid })
      await bad(channels.wholesale.deliver, id)
      await bad(channels.wholesale.exportReceipt, id)
      const schedule = {
        orderId: id,
        scheduledDate: localDate(),
        deliveryAddress: 'Updated delivery address',
        deliveryNotes: 'Signed at reception'
      }
      await bad(channels.wholesale.schedule, { ...schedule, scheduledDate: '2026-02-30' })
      await bad(channels.wholesale.schedule, { ...schedule, scheduledDate: '2000-01-01' })
      await ok(channels.wholesale.schedule, { ...schedule, scheduledDate: '2099-01-01' })
      await ok(channels.wholesale.schedule, schedule)
      const scheduled = await ok(channels.wholesale.get, id)
      assert.equal(scheduled.scheduledDate, localDate())
      assert.equal(scheduled.deliveryAddress, schedule.deliveryAddress)
      await bad(channels.wholesale.deliver, {
        orderId: id,
        items: [{ batchId: batches[0].id, quantity: 999 }]
      })
      let saved = await snapshot()
      await sql`CREATE TRIGGER test_fail_wholesale BEFORE UPDATE OF status ON wholesale_orders WHEN NEW.status = 'delivered' BEGIN SELECT RAISE(ABORT, 'test failure'); END`.execute(
        db
      )
      await bad(channels.wholesale.deliver, id)
      assert.deepEqual(await snapshot(), saved)
      await sql`DROP TRIGGER test_fail_wholesale`.execute(db)
      await db
        .updateTable('batches')
        .set({ expiresAt: '2000-01-01' })
        .where('id', '=', batches[1].id)
        .execute()
      saved = await snapshot()
      await bad(channels.wholesale.deliver, id)
      assert.deepEqual(await snapshot(), saved)
      await db
        .updateTable('batches')
        .set({ expiresAt: '2099-01-01' })
        .where('id', '=', batches[1].id)
        .execute()
      await db
        .updateTable('drugs')
        .set({ isArchived: 1 })
        .where('id', '=', products[0].id)
        .execute()
      await bad(channels.wholesale.deliver, id)
      await db
        .updateTable('drugs')
        .set({ isArchived: 0 })
        .where('id', '=', products[0].id)
        .execute()
      await ok(channels.wholesale.deliver, id)
      saved = await snapshot()
      await bad(channels.wholesale.deliver, id)
      await bad(channels.wholesale.schedule, schedule)
      await bad(channels.wholesale.cancel, id)
      assert.deepEqual(await snapshot(), saved)
      assert.deepEqual(
        (await stock()).map((batch) => batch.currentStock),
        [18, 18]
      )
      let delivered = await ok(channels.wholesale.get, id)
      assert.equal(delivered.status, 'delivered')
      assert.match(deliveryReceiptText(delivered), /Wholesale Client/)
      assert.match(deliveryReceiptText(delivered), /Wholesale Alpha/)
      assert.match(deliveryReceiptText(delivered), /Updated delivery address/)
      assert.equal(await ok(channels.wholesale.exportReceipt, id), true)
      assert.equal(
        await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8'),
        deliveryReceiptText(delivered)
      )
      assert.deepEqual(await snapshot(), saved)
      const exportPath = process.env.INVENTORY_TEST_EXPORT
      process.env.INVENTORY_TEST_EXPORT = join(exportPath, 'invalid.txt')
      await bad(channels.wholesale.exportReceipt, id)
      process.env.INVENTORY_TEST_EXPORT = exportPath
      assert.deepEqual(await snapshot(), saved)
      state.session = { account: admin }
      assert.equal((await ok(channels.wholesale.alerts)).count, 1)
      assert.equal((await ok(channels.wholesale.list, { overdue: true })).length, 1)
      assert.equal((await ok(channels.wholesale.get, id)).receivable.deadlineStatus, 'overdue')
      for (const invalid of [
        { amountCents: -1 },
        { amountCents: 0 },
        { amountCents: 1.5 },
        { amountCents: 40001 },
        { paidAt: '2099-01-01' },
        { paidAt: '2026-02-30' },
        { paidAt: '2000-01-01' },
        { orderId: 99999 },
        { reference: '' }
      ])
        await bad(channels.wholesale.pay, { ...payment(id, 10000), ...invalid })
      await ok(channels.wholesale.pay, payment(id, 15000, 'FIRST-PAYMENT'))
      delivered = await ok(channels.wholesale.get, id)
      assert.equal(delivered.receivable.remainingCents, 25000)
      assert.equal(delivered.receivable.paymentStatus, 'partially_paid')
      assert.equal(delivered.receivable.deadlineStatus, 'overdue')
      await bad(channels.wholesale.pay, payment(id, 100, 'first-payment'))
      await bad(channels.wholesale.pay, payment(id, 25001))
      await ok(channels.wholesale.pay, payment(id, 25000, 'FINAL-PAYMENT'))
      delivered = await ok(channels.wholesale.get, id)
      assert.equal(delivered.receivable.remainingCents, 0)
      assert.equal(delivered.receivable.paymentStatus, 'paid')
      assert.equal(delivered.receivable.deadlineStatus, 'paid')
      assert.equal((await ok(channels.wholesale.alerts)).count, 0)
      assert.equal((await ok(channels.wholesale.list, { overdue: true })).length, 0)
      const firstPayment = delivered.payments.find((record) => record.reference === 'FIRST-PAYMENT')
      const correction = { ...payment(id, 10000, 'FIRST-PAYMENT'), paymentId: firstPayment.id }
      await bad(channels.wholesale.pay, { ...correction, paymentId: 99999 })
      await bad(channels.wholesale.pay, { ...correction, amountCents: 15001 })
      await bad(channels.wholesale.pay, { ...correction, reference: 'FINAL-PAYMENT' })
      state.session = { account: staff }
      await bad(channels.wholesale.pay, correction)
      state.session = { account: admin }
      await ok(channels.wholesale.pay, correction)
      assert.equal((await ok(channels.wholesale.get, id)).receivable.remainingCents, 5000)
      assert.equal((await ok(channels.wholesale.alerts)).count, 1)
      await ok(channels.wholesale.pay, { ...correction, amountCents: 15000 })
      delivered = await ok(channels.wholesale.get, id)
      assert.equal(delivered.payments.length, 2)
      assert.equal(
        delivered.payments.find((record) => record.id === firstPayment.id).createdAt,
        firstPayment.createdAt
      )
      assert.equal(delivered.receivable.remainingCents, 0)
      assert.equal((await ok(channels.wholesale.alerts)).count, 0)
      await bad(channels.wholesale.pay, payment(id, 1))
      assert.equal(receivable(10000, 0, localDate()).deadlineStatus, 'upcoming')
      assert.equal(receivable(10000, 0, '2099-01-01').paymentStatus, 'outstanding')
      const insufficient = await ok(channels.wholesale.create, {
        ...draft,
        requestId: randomUUID(),
        items: [{ ...lines[0], quantity: 19 }]
      })
      await ok(channels.wholesale.schedule, { ...schedule, orderId: insufficient })
      saved = await snapshot()
      await bad(channels.wholesale.deliver, insufficient)
      assert.deepEqual(await snapshot(), saved)
      await ok(channels.wholesale.cancel, insufficient)
      await bad(channels.wholesale.pay, payment(insufficient, 1))
      await bad(channels.wholesale.schedule, { ...schedule, orderId: insufficient })
      const prepaid = await ok(channels.wholesale.create, {
        ...draft,
        requestId: randomUUID(),
        dueDate: '2099-01-01',
        items: [lines[0]]
      })
      await ok(channels.wholesale.pay, payment(prepaid, 100))
      await bad(channels.wholesale.cancel, prepaid)
      assert.equal(
        (await ok(channels.wholesale.get, prepaid)).receivable.deadlineStatus,
        'upcoming'
      )
      const concurrent = []
      for (let index = 0; index < 2; index++) {
        const orderId = await ok(channels.wholesale.create, {
          ...draft,
          requestId: randomUUID(),
          items: [{ ...lines[1], quantity: 18 }]
        })
        await ok(channels.wholesale.schedule, { ...schedule, orderId })
        concurrent.push(orderId)
      }
      const results = await Promise.all(
        concurrent.map((orderId) => invoke(channels.wholesale.deliver, orderId))
      )
      assert.equal(results.filter((result) => result.success).length, 1)
      assert.equal((await stock())[1].currentStock, 0)
      const payRace = await ok(channels.wholesale.create, {
        ...draft,
        requestId: randomUUID(),
        items: [{ ...lines[0], quantity: 1 }]
      })
      const payments = await Promise.all([
        invoke(channels.wholesale.pay, payment(payRace, 10000)),
        invoke(channels.wholesale.pay, payment(payRace, 10000))
      ])
      assert.equal(payments.filter((result) => result.success).length, 1)
      assert.equal((await ok(channels.wholesale.get, payRace)).receivable.remainingCents, 0)
      assert.equal((await ok(channels.wholesale.list, { search: 'Wholesale Client' })).length, 6)
      assert.equal((await ok(channels.wholesale.list, { status: 'delivered' })).length, 2)
      assert.equal((await ok(channels.wholesale.list, { beforeId: payRace })).length, 5)
      assert.equal((await ok(channels.wholesale.list, { search: 'no match' })).length, 0)
      state.session = { account: staff }
      assert.equal((await ok(channels.wholesale.list, {}))[0].receivable, undefined)
      await db.updateTable('accounts').set({ isArchived: 1 }).where('id', '=', staff.id).execute()
      await bad(channels.wholesale.get, id)
      assert.equal(state.session, undefined)
      await db
        .updateTable('accounts')
        .set({ isArchived: 0, isVerified: 0 })
        .where('id', '=', staff.id)
        .execute()
      state.session = { account: staff }
      await bad(channels.wholesale.list, {})
      assert.equal(state.session, undefined)
      console.log(
        'PASS: order validation/idempotency, live products, no stock at creation, schedule updates, full delivery, receipt/export failure, atomic rollback, expiry, oversell/over-delivery prevention, cancellation, partial/full/prepayments, overdue, duplicate references, concurrent payments, admin/staff/cashier/blocked authorization'
      )
    }
  } finally {
    await db.destroy()
  }
}
