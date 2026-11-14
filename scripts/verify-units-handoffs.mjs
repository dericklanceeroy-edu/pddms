/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
/**
 * Verifies box/piece units, the walk-in Senior/PWD discount and "handled by" tracking
 * end to end through the IPC handlers, then again after a separate-process restart.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.UNITS_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-units-test-'))
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
            UNITS_TEST_PHASE: phase,
            DATABASE: join(directory, 'units.db'),
            INVENTORY_TEST_EXPORT: join(directory, 'receipt.txt')
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-units-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { calculateSale, receiptText } = await import('../src/shared/sales.ts')
  const { deliveryReceiptText } = await import('../src/shared/wholesale.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  const { sql } = await import('kysely')
  await import('../src/main/sales/controller.ts')
  await import('../src/main/product/controller.ts')
  await import('../src/main/purchase-order/controller.ts')
  await import('../src/main/procurement/controller.ts')
  await import('../src/main/wholesale/controller.ts')
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
  const reconcile = async () => {
    const batches = await db.selectFrom('batches').selectAll().execute()
    const movement = await db.selectFrom('stockOuts').selectAll().execute()
    for (const batch of batches)
      assert.equal(
        batch.initialStock - batch.currentStock,
        movement
          .filter((item) => item.batchId === batch.id)
          .reduce((sum, item) => sum + item.quantity, 0)
      )
    assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
    assert.equal((await sql`PRAGMA integrity_check`.execute(db)).rows[0].integrityCheck, 'ok')
  }
  const master = () =>
    db.selectFrom('accounts').selectAll().where('username', '=', 'units-admin').executeTakeFirst()
  try {
    if (process.env.UNITS_TEST_PHASE === 'restart') {
      state.session = { account: await master() }
      const sales = (await ok(channels.sales.history)).records
      const walkIns = sales.filter(
        (sale) => sale.customerId === null && sale.discountType !== 'none'
      )
      assert.deepEqual(
        walkIns.map((sale) => [sale.customerName, sale.discountType, sale.discountId]).reverse(),
        [
          ['Juan Dela Cruz', 'senior', 'SC20260001'],
          ['Maria Clara', 'pwd', 'PWD0042']
        ]
      )
      const boxSale = (await ok(channels.sales.getOne, sales.at(-1).id)).sale
      assert.deepEqual(
        boxSale.items.map((item) => [item.unit, item.piecesPerUnit, item.quantity]),
        [
          ['box', 10, 2],
          ['piece', 1, 3]
        ]
      )
      const orders = (await ok(channels.purchaseOrder.getAll)).orders
      assert.ok(orders.every((order) => order.createdByName === 'Units Admin'))
      assert.ok(orders.some((order) => order.cancelledByName === 'Units Admin'))
      const deliveries = (await ok(channels.procurement.getRecords)).deliveries
      assert.ok(deliveries.every((delivery) => delivery.deliveredByName === 'Supplier Driver'))
      await reconcile()
      console.log(
        'PASS: separate-process restart, units / walk-in / handled-by snapshots persist, stock reconciliation, integrity'
      )
    } else {
      const { hash } = await import('argon2')
      const password = await hash('UnitsTest123')
      const admin = await db
        .insertInto('accounts')
        .values({ role: 'master', username: 'units-admin', fullName: 'Units Admin', password })
        .returningAll()
        .executeTakeFirstOrThrow()
      const cashier = await db
        .insertInto('accounts')
        .values({ role: 'cashier', username: 'units-cashier', fullName: 'Units Cashier', password })
        .returningAll()
        .executeTakeFirstOrThrow()
      state.session = { account: admin }
      const supplier = await db
        .insertInto('suppliers')
        .values({
          organization: 'Units Supplier',
          person: 'Supplier Person',
          phone: '09170000001',
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
      const customer = await db
        .insertInto('customers')
        .values({
          fullName: 'Clinic Client',
          clientType: 'pharmacy',
          phone: '09171112222',
          email: null,
          address: 'Clinic Street',
          discountType: 'none',
          discountId: null,
          discountExpiresAt: null
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      // Products: pieces per box is validated and defaults to 1.
      const product = (fields) =>
        invoke(channels.product.createOne, {
          genericName: 'Generic',
          formulation: '500 mg tablet',
          category: 'Medicine',
          isPrescribed: false,
          isControlled: false,
          reorderLevel: 5,
          ...fields
        })
      assert.equal((await product({ brandName: 'Zero Box', piecesPerBox: 0 })).success, false)
      assert.equal((await product({ brandName: 'Half Box', piecesPerBox: 2.5 })).success, false)
      const boxed = (
        await ok(channels.product.createOne, {
          brandName: 'Boxed Tablet',
          genericName: 'Generic',
          formulation: '500 mg tablet',
          category: 'Medicine',
          isPrescribed: false,
          isControlled: false,
          reorderLevel: 5,
          piecesPerBox: 10
        })
      ).product
      const loose = (
        await ok(channels.product.createOne, {
          brandName: 'Loose Syrup',
          genericName: 'Generic',
          formulation: '60 ml syrup',
          category: 'Medicine',
          isPrescribed: false,
          isControlled: false,
          reorderLevel: 5
        })
      ).product
      assert.equal(boxed.piecesPerBox, 10)
      assert.equal(loose.piecesPerBox, 1)

      // Purchase orders are per box only; quantity and cost are per box. A product sold loose
      // has a box of 1.
      await bad(channels.purchaseOrder.createOne, {
        supplierId: supplier.id,
        items: [{ drugId: boxed.id, quantity: 1, unitCost: 10, unit: 'piece' }]
      })
      const order = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: [
            { drugId: boxed.id, quantity: 3, unitCost: 500, unit: 'box' },
            { drugId: loose.id, quantity: 20, unitCost: 20 }
          ]
        })
      ).order
      assert.equal(order.totalAmount, 1900)
      assert.deepEqual(
        order.items.map((item) => [item.unit, item.piecesPerUnit]),
        [
          ['box', 10],
          ['box', 1]
        ]
      )
      assert.equal(order.submittedByName, null)
      const submitted = (
        await ok(channels.purchaseOrder.updateStatusById, order.id, {
          status: 'submitted'
        })
      ).order
      assert.equal(submitted.submittedByName, 'Units Admin')
      assert.ok(submitted.submittedAt)

      const boxLine = order.items.find((item) => item.drugId === boxed.id)
      const looseLine = order.items.find((item) => item.drugId === loose.id)
      const delivery = (extra = {}) => ({
        requestId: randomUUID(),
        deliveredAt: localDate(),
        notes: null,
        deliveredByName: 'Supplier Driver',
        checkedByName: 'Receiving Clerk',
        items: [
          {
            itemId: boxLine.id,
            receivedQuantity: 2,
            batchNumber: 'BOX-1',
            sellPrice: 60,
            boxSellPrice: 550,
            expiresAt: '2099-01-01'
          },
          {
            itemId: looseLine.id,
            receivedQuantity: 20,
            batchNumber: 'LOOSE-1',
            sellPrice: 25,
            expiresAt: '2099-01-01'
          }
        ],
        ...extra
      })
      // Handled-by names are required and must be names.
      await bad(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery(),
        deliveredByName: ''
      })
      await bad(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery(),
        checkedByName: '12345'
      })
      // A box price on a piece-only product is refused.
      await bad(
        channels.purchaseOrder.recordDeliveryById,
        order.id,
        delivery({ items: [{ ...delivery().items[1], boxSellPrice: 100 }] })
      )
      // Prices are checked like for like: ₱500 per box of 10 is ₱50 per piece.
      await bad(
        channels.purchaseOrder.recordDeliveryById,
        order.id,
        delivery({ items: [{ ...delivery().items[0], sellPrice: 49.99 }] })
      )
      await bad(
        channels.purchaseOrder.recordDeliveryById,
        order.id,
        delivery({ items: [{ ...delivery().items[0], boxSellPrice: 499 }] })
      )
      // Over-receiving is counted in the line's own unit (3 boxes ordered).
      await bad(
        channels.purchaseOrder.recordDeliveryById,
        order.id,
        delivery({ items: [{ ...delivery().items[0], receivedQuantity: 4 }] })
      )
      assert.equal((await db.selectFrom('batches').selectAll().execute()).length, 0)
      await ok(channels.purchaseOrder.recordDeliveryById, order.id, delivery())
      let boxBatch = await db
        .selectFrom('batches')
        .selectAll()
        .where('physicalTag', '=', 'BOX-1')
        .executeTakeFirstOrThrow()
      const looseBatch = await db
        .selectFrom('batches')
        .selectAll()
        .where('physicalTag', '=', 'LOOSE-1')
        .executeTakeFirstOrThrow()
      assert.equal(boxBatch.currentStock, 20)
      assert.equal(boxBatch.buyPrice, 50)
      assert.equal(boxBatch.boxSellPrice, 550)
      assert.equal(looseBatch.currentStock, 20)
      assert.equal(looseBatch.boxSellPrice, null)
      // The last box tops up the same batch because the per-piece cost matches.
      await ok(
        channels.purchaseOrder.recordDeliveryById,
        order.id,
        delivery({ items: [{ ...delivery().items[0], receivedQuantity: 1 }] })
      )
      boxBatch = await db
        .selectFrom('batches')
        .selectAll()
        .where('id', '=', boxBatch.id)
        .executeTakeFirstOrThrow()
      assert.equal(boxBatch.currentStock, 30)
      const records = await ok(channels.procurement.getRecords)
      assert.equal(records.deliveries.length, 2)
      for (const record of records.deliveries) {
        assert.equal(record.deliveredByName, 'Supplier Driver')
        assert.equal(record.checkedByName, 'Receiving Clerk')
        assert.equal(record.recordedByName, 'Units Admin')
      }
      assert.ok(
        records.deliveries
          .flatMap((record) => record.items)
          .some((item) => item.unit === 'box' && item.piecesPerUnit === 10)
      )
      const products = (await ok(channels.product.getAll)).products
      assert.deepEqual(
        products
          .find((item) => item.id === boxed.id)
          .batches[0].receipts.map((receipt) => receipt.quantity)
          .sort(),
        [10, 20]
      )
      // Payables use the box cost: 3 boxes × ₱500 + 20 × ₱20.
      const summary = records.paymentSummaries.find((row) => row.purchaseOrderId === order.id)
      assert.equal(summary.totalAmount, 1900)

      const cancelled = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: [{ drugId: loose.id, quantity: 1, unitCost: 20 }]
        })
      ).order
      const closed = (
        await ok(channels.purchaseOrder.updateStatusById, cancelled.id, {
          status: 'cancelled'
        })
      ).order
      assert.equal(closed.cancelledByName, 'Units Admin')
      assert.equal(closed.submittedByName, null)

      // Sales by box and by piece.
      state.session = { account: cashier }
      const boxCart = { batchId: boxBatch.id, quantity: 2, unit: 'box', unitPriceCents: 55000 }
      const pieceCart = { batchId: looseBatch.id, quantity: 3, unit: 'piece', unitPriceCents: 2500 }
      const checkout = (fields) => ({
        requestId: randomUUID(),
        customerId: null,
        items: [boxCart, pieceCart],
        expectedTotalCents: 117500,
        cashCents: 200000,
        ...fields
      })
      await bad(
        channels.sales.checkout,
        checkout({ items: [{ ...boxCart, unitPriceCents: 12000 }] })
      )
      await bad(
        channels.sales.checkout,
        checkout({ items: [{ ...pieceCart, unit: 'box' }], expectedTotalCents: 7500 })
      )
      await bad(
        channels.sales.checkout,
        checkout({ items: [{ ...boxCart, quantity: 4 }], expectedTotalCents: 220000 })
      )
      assert.equal(
        (await ok(channels.sales.quote, { customerId: null, items: [boxCart, pieceCart] })).totals
          .totalCents,
        117500
      )
      const boxSale = (await ok(channels.sales.checkout, checkout())).sale
      assert.deepEqual(
        boxSale.items.map((item) => [item.unit, item.piecesPerUnit]),
        [
          ['box', 10],
          ['piece', 1]
        ]
      )
      assert.match(receiptText(boxSale), /2 boxes \(×10 pcs\) × ₱550\.00 per box of 10/)
      const stock = async (id) =>
        (
          await db
            .selectFrom('batches')
            .select('currentStock')
            .where('id', '=', id)
            .executeTakeFirstOrThrow()
        ).currentStock
      assert.equal(await stock(boxBatch.id), 10)
      assert.equal(await stock(looseBatch.id), 17)

      // Walk-in Senior/PWD discount with the ID checked at the counter.
      const piece = { batchId: boxBatch.id, quantity: 1, unit: 'piece', unitPriceCents: 6000 }
      const discounted = calculateSale([piece], 'senior').totalCents
      const walkIn = {
        discountType: 'senior',
        holderName: 'Juan Dela Cruz',
        discountId: 'SC-2026-0001',
        discountExpiresAt: null
      }
      const walkInSale = (fields) =>
        checkout({ items: [piece], expectedTotalCents: discounted, ...fields })
      for (const invalid of [
        { ...walkIn, discountId: '12' },
        { ...walkIn, discountId: 'SC<script>' },
        { ...walkIn, holderName: 'J' },
        { ...walkIn, discountType: 'pwd' },
        { ...walkIn, discountType: 'pwd', discountExpiresAt: '2000-01-01' },
        { ...walkIn, discountExpiresAt: '2026-02-30' }
      ])
        await bad(channels.sales.checkout, walkInSale({ walkInDiscount: invalid }))
      const regular = await db
        .insertInto('customers')
        .values({
          fullName: 'Registered Customer',
          phone: '09173334444',
          email: null,
          address: null,
          discountType: 'none',
          discountId: null,
          discountExpiresAt: null
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await bad(
        channels.sales.checkout,
        walkInSale({ customerId: regular.id, walkInDiscount: walkIn })
      )
      // The quoted total must already include the discount.
      await bad(
        channels.sales.checkout,
        walkInSale({ walkInDiscount: walkIn, expectedTotalCents: 6000 })
      )
      const request = walkInSale({ walkInDiscount: walkIn })
      const sale = (await ok(channels.sales.checkout, request)).sale
      assert.equal(sale.customerId, null)
      assert.equal(sale.customerName, 'Juan Dela Cruz')
      assert.equal(sale.discountType, 'senior')
      // Note: Separators typed on the ID are dropped; discount IDs keep letters and numbers only.
      assert.equal(sale.discountId, 'SC20260001')
      assert.equal(sale.totalCents, discounted)
      assert.match(receiptText(sale), /Senior Citizen ID: SC20260001 \(walk-in/)
      // Retrying the same request is idempotent; reusing it for another ID is refused.
      assert.equal((await ok(channels.sales.checkout, request)).sale.id, sale.id)
      await bad(channels.sales.checkout, {
        ...request,
        walkInDiscount: { ...walkIn, holderName: 'Maria Clara' }
      })
      const pwd = (
        await ok(
          channels.sales.checkout,
          walkInSale({
            walkInDiscount: {
              discountType: 'pwd',
              holderName: 'Maria Clara',
              discountId: 'PWD-0042',
              discountExpiresAt: '2099-12-31'
            }
          })
        )
      ).sale
      assert.equal(pwd.discountExpiresAt, '2099-12-31')
      assert.equal(await stock(boxBatch.id), 8)

      // Wholesale: a box line deducts its pieces on delivery and records every hand-off.
      state.session = { account: admin }
      const wholesaleDraft = (items) => ({
        requestId: randomUUID(),
        customerId: customer.id,
        dueDate: '2099-01-01',
        scheduledDate: localDate(),
        deliveryAddress: 'Clinic Street',
        notes: '',
        items
      })
      const orderId = (
        await ok(
          channels.wholesale.create,
          wholesaleDraft([
            { batchId: looseBatch.id, quantity: 2, unit: 'box', unitPriceCents: 2500 }
          ])
        )
      ).data
      await ok(channels.wholesale.schedule, {
        orderId,
        scheduledDate: localDate(),
        deliveryAddress: 'Clinic Street',
        deliveryNotes: '',
        driverName: 'Pedro Driver'
      })
      await bad(channels.wholesale.deliver, {
        orderId,
        driverName: 'Pedro Driver',
        receivedByName: ''
      })
      await ok(channels.wholesale.deliver, {
        orderId,
        driverName: 'Pedro Driver',
        receivedByName: 'Ana Pharmacist'
      })
      const delivered = (await ok(channels.wholesale.get, orderId)).data
      assert.equal(delivered.createdByName, 'Units Admin')
      assert.equal(delivered.scheduledByName, 'Units Admin')
      assert.equal(delivered.deliveredByName, 'Units Admin')
      assert.equal(delivered.driverName, 'Pedro Driver')
      assert.equal(delivered.receivedByName, 'Ana Pharmacist')
      assert.match(deliveryReceiptText(delivered), /Received by: Ana Pharmacist/)
      assert.equal(await stock(looseBatch.id), 15)
      // Wholesale orders are per box only.
      await bad(
        channels.wholesale.create,
        wholesaleDraft([
          { batchId: looseBatch.id, quantity: 1, unit: 'piece', unitPriceCents: 2500 }
        ])
      )
      // Only 8 pieces remain in the boxed batch, so a 10-piece box cannot be ordered.
      await bad(
        channels.wholesale.create,
        wholesaleDraft([{ batchId: boxBatch.id, quantity: 1, unit: 'box', unitPriceCents: 55000 }])
      )
      const boxOrder = (
        await ok(
          channels.wholesale.create,
          wholesaleDraft([
            { batchId: looseBatch.id, quantity: 1, unit: 'box', unitPriceCents: 2500 }
          ])
        )
      ).data
      await ok(channels.wholesale.cancel, boxOrder)
      const cancelledOrder = (await ok(channels.wholesale.get, boxOrder)).data
      assert.equal(cancelledOrder.cancelledByName, 'Units Admin')
      assert.equal(cancelledOrder.items[0].piecesPerUnit, 1)

      await reconcile()
      console.log(
        'PASS: pieces per box, box-only purchase orders / receiving / batch top-up, box and piece sales, box-only wholesale, walk-in Senior/PWD validation / idempotency / receipt, handled-by on POs, deliveries and wholesale'
      )
    }
  } finally {
    await db.destroy()
  }
}
