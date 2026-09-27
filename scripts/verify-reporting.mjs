/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.REPORT_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-report-test-'))
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
            REPORT_TEST_PHASE: phase,
            DATABASE: join(directory, 'reports.db'),
            INVENTORY_TEST_EXPORT: join(directory, 'report.csv')
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-report-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { dateBounds, reportTitles } = await import('../src/shared/reporting.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { handlers, dialog } = await import('./inventory-test-electron.mjs')
  const { generateReport, reportCsv } = await import('../src/main/reporting/repository.ts')
  const { findPaymentSummaries } = await import('../src/main/procurement/repository.ts')
  const { getAdminDashboard } = await import('../src/main/dashboard/repository.ts')
  const { sql } = await import('kysely')
  for (const module of [
    'reporting',
    'sales',
    'wholesale',
    'product',
    'purchase-order',
    'procurement'
  ])
    await import(`../src/main/${module}/controller.ts`)
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
  const filter = (kind, other = {}) => ({
    kind,
    from: localDate(),
    to: localDate(),
    search: '',
    page: 1,
    ...other
  })
  const report = async (kind, other) =>
    (await ok(channels.reporting.generate, filter(kind, other))).report
  const metric = (report, label) => {
    const value = report.metrics.find((item) => item.label === label)
    assert.ok(value, label)
    return value.value
  }
  try {
    if (process.env.REPORT_TEST_PHASE === 'restart') {
      state.session = {
        account: await db
          .selectFrom('accounts')
          .selectAll()
          .where('role', '=', 'master')
          .executeTakeFirstOrThrow()
      }
      assert.equal((await report('sales')).totalRows, 2)
      assert.equal(metric(await report('income'), 'Combined revenue'), 76000)
      assert.equal(metric(await report('inventory'), 'Inventory at cost'), 194000)
      assert.equal((await report('overdue')).totalRows, 1)
      assert.equal(
        await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8').then((text) =>
          text.includes('FINAL-AR')
        ),
        true
      )
      assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
      assert.equal((await sql`PRAGMA integrity_check`.execute(db)).rows[0].integrityCheck, 'ok')
      console.log(
        'PASS: separate-process report reload, repeated migrations, persisted totals/balances/export, foreign keys and database integrity'
      )
    } else {
      const { hash } = await import('argon2')
      const password = await hash('ReportTest123')
      const accounts = []
      for (const role of ['master', 'staff', 'cashier'])
        accounts.push(
          await db
            .insertInto('accounts')
            .values({
              role,
              username: `report-${role}`,
              fullName: `Report ${role}`,
              password,
              isVerified: 1
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        )
      const [admin, staff, cashier] = accounts
      state.session = { account: admin }
      assert.equal((await report('sales')).totalRows, 0)
      const supplier = await db
        .insertInto('suppliers')
        .values({
          organization: 'Reporting Supplier',
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
      for (const [index, brandName] of [
        'Report Alpha',
        'Report Beta',
        'No Movement',
        'Archived Stock'
      ].entries())
        products.push(
          (
            await ok(channels.product.createOne, {
              brandName,
              genericName: 'Generic',
              formulation: '500 mg tablet',
              category: 'Medicine',
              isPrescribed: index === 0,
              isControlled: index === 1,
              reorderLevel: 5
            })
          ).product
        )
      const po = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: products.slice(0, 2).map((product, index) => ({
            drugId: product.id,
            quantity: 20,
            unitCost: index ? 40 : 80
          }))
        })
      ).order
      await ok(channels.purchaseOrder.updateStatusById, po.id, { status: 'submitted' })
      await ok(channels.purchaseOrder.recordDeliveryById, po.id, {
        requestId: randomUUID(),
        deliveredAt: localDate(),
        items: po.items.map((item, index) => ({
          itemId: item.id,
          receivedQuantity: 20,
          batchNumber: `REPORT-${index}`,
          sellPrice: index ? 56 : 112,
          expiresAt: '2099-01-01'
        }))
      })
      const batches = await db.selectFrom('batches').selectAll().orderBy('id').execute()
      const customers = []
      for (const discountType of ['senior', 'none'])
        customers.push(
          await db
            .insertInto('customers')
            .values({
              fullName: discountType === 'senior' ? 'Senior Client' : 'Wholesale Client',
              phone: '09171234567',
              email: null,
              address: 'Delivery address',
              discountType,
              discountId: discountType === 'senior' ? 'SC-REPORT' : null,
              discountExpiresAt: null
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        )
      const [senior, regular] = customers
      const line = (index, quantity) => ({
        batchId: batches[index].id,
        quantity,
        unitPriceCents: index ? 5600 : 11200
      })
      const checkout = async (items, customerId, total, cash = total) =>
        (
          await ok(channels.sales.checkout, {
            requestId: randomUUID(),
            items,
            customerId,
            expectedTotalCents: total,
            cashCents: cash
          })
        ).sale
      const sale = await checkout([line(0, 2), line(1, 1)], senior.id, 20000, 25000)
      await checkout([line(0, 1)], null, 11200)
      const oldSale = await checkout([line(1, 1)], null, 5600)
      const bounds = dateBounds(localDate(), localDate())
      await db
        .updateTable('sales')
        .set({ createdAt: new Date(Date.parse(bounds.start) - 1).toISOString() })
        .where('id', '=', oldSale.id)
        .execute()
      await bad(channels.sales.checkout, {
        requestId: randomUUID(),
        customerId: null,
        items: [line(0, 1)],
        expectedTotalCents: 11200,
        cashCents: 1
      })
      const draft = (items) => ({
        requestId: randomUUID(),
        customerId: regular.id,
        dueDate: '2000-01-01',
        deliveryAddress: 'Address',
        notes: '',
        items
      })
      const deliveredId = (await ok(channels.wholesale.create, draft([line(0, 3), line(1, 2)])))
        .data
      await ok(channels.wholesale.schedule, {
        orderId: deliveredId,
        scheduledDate: localDate(),
        deliveryAddress: 'Address',
        deliveryNotes: ''
      })
      await ok(channels.wholesale.deliver, deliveredId)
      const pendingId = (await ok(channels.wholesale.create, draft([line(0, 1)]))).data
      const cancelledId = (await ok(channels.wholesale.create, draft([line(0, 1)]))).data
      await ok(channels.wholesale.cancel, cancelledId)
      const pay = (orderId, amountCents, reference) =>
        ok(channels.wholesale.pay, {
          orderId,
          amountCents,
          reference,
          paidAt: localDate(),
          method: 'Cash',
          notes: ''
        })
      await pay(deliveredId, 10000, 'FIRST-AR')
      await pay(pendingId, 5000, 'PREPAY-AR')
      await ok(channels.procurement.recordPayment, {
        purchaseOrderId: po.id,
        invoiceId: null,
        amount: 200,
        paidAt: localDate(),
        method: 'Cash',
        referenceNumber: 'REPORT-AP',
        notes: 'Actual supplier payment'
      })
      for (const [drugId, qty, cost, expiry] of [
        [products[0].id, 5, 30, '2000-01-01'],
        [products[3].id, 3, 10, '2099-01-01']
      ])
        await db
          .insertInto('batches')
          .values({
            drugId,
            supplierId: supplier.id,
            physicalTag: `EXTRA-${drugId}`,
            initialStock: qty,
            currentStock: qty,
            buyPrice: cost,
            sellPrice: cost * 2,
            expiresAt: expiry
          })
          .execute()
      await db
        .updateTable('drugs')
        .set({ isArchived: 1 })
        .where('id', '=', products[3].id)
        .execute()
      for (const kind of Object.keys(reportTitles)) {
        const value = await report(kind)
        assert.ok(value.columns.length > 0, kind)
        assert.equal(value.rows.length <= 100, true)
        assert.ok(value.notes.length)
      }
      const sales = await report('sales')
      assert.equal(sales.totalRows, 2)
      assert.equal(metric(sales, 'Retail revenue'), 31200)
      assert.equal(metric(sales, 'Units sold'), 4)
      assert.equal(metric(sales, 'Discounts'), 5000)
      assert.equal(metric(sales, 'VAT exemption'), 3000)
      assert.ok(sales.rows.some((row) => row.products.includes('Report Alpha')))
      assert.equal((await report('sales', { search: 'Senior Client' })).totalRows, 1)
      assert.equal((await report('sales', { search: 'no match' })).totalRows, 0)
      assert.equal((await report('sales', { from: '2000-01-01', to: '2000-01-01' })).totalRows, 0)
      const inventory = await report('inventory')
      assert.equal(metric(inventory, 'Inventory at cost'), 194000)
      const alpha = inventory.rows.filter((row) => row.productId === products[0].id)
      assert.equal(alpha.length, 2)
      assert.equal(alpha[0].stock, 19)
      assert.equal(alpha[0].sellable, 14)
      assert.ok(alpha.some((row) => row.expiryStatus.includes('Expired')))
      assert.equal((await report('inventory', { search: 'Report Beta' })).rows[0].valueCents, 64000)
      assert.equal(
        (await getAdminDashboard()).operationsPulse.find(
          (metric) => metric.id === 'stock-valuation'
        ).value,
        1940
      )
      const movement = await report('movement')
      assert.equal(movement.rows[0].productId, products[0].id)
      assert.equal(movement.rows[0].quantity, 6)
      assert.equal(movement.rows[1].quantity, 3)
      assert.match(movement.rows[0].movement, /Fastest/)
      assert.match(movement.rows[1].movement, /Slowest/)
      assert.equal(
        movement.rows.find((row) => row.productId === products[2].id).movement,
        'No movement'
      )
      assert.equal(
        metric(
          await report('movement', { from: '2000-01-01', to: '2000-01-01' }),
          'Units sold / delivered'
        ),
        0
      )
      const finance = await report('financial')
      for (const [label, expected] of [
        ['Retail revenue', 31200],
        ['Delivered wholesale revenue', 44800],
        ['Combined revenue', 76000],
        ['Supplier payments (recorded outflows)', 20000],
        ['Revenue minus supplier payments (not profit)', 56000],
        ['AR collections (not additional revenue)', 15000],
        ['Retail receipts + AR collections − supplier payments', 26200],
        ['Current AR outstanding', 41000],
        ['Current AP outstanding', 220000],
        ['Current inventory at cost', 194000],
        ['Retail transactions', 2],
        ['Delivered wholesale orders', 1]
      ])
        assert.equal(metric(finance, label), expected, label)
      assert.equal(
        metric(finance, 'Current AP outstanding'),
        (await findPaymentSummaries())[0].outstandingAmount * 100
      )
      const income = await report('income')
      assert.equal(income.totalRows, 3)
      assert.equal(metric(income, 'Combined revenue'), 76000)
      assert.equal(metric(income, 'Wholesale revenue'), 44800)
      assert.equal(metric(income, 'Retail revenue'), 31200)
      assert.equal((await report('cash')).totalRows, 0)
      await sql`PRAGMA ignore_check_constraints = ON`.execute(db)
      await db.updateTable('sales').set({ changeCents: 5001 }).where('id', '=', sale.id).execute()
      const inconsistent = await report('cash')
      assert.equal(inconsistent.totalRows, 1)
      assert.equal(inconsistent.rows[0].differenceCents, -1)
      await db.updateTable('sales').set({ changeCents: 5000 }).where('id', '=', sale.id).execute()
      await sql`PRAGMA ignore_check_constraints = OFF`.execute(db)
      assert.equal((await report('cash')).totalRows, 0)
      assert.equal((await report('overdue')).totalRows, 2)
      await pay(deliveredId, 34800, 'FINAL-AR')
      assert.equal((await report('overdue')).totalRows, 1)
      assert.equal((await report('overdue')).rows[0].remainingCents, 6200)
      assert.equal((await report('arPayments', { search: 'FINAL-AR' })).rows[0].remainingCents, 0)
      assert.equal((await report('arPayments', { search: 'Wholesale Client' })).totalRows, 3)
      assert.equal(
        (await report('apPayments', { search: 'Reporting Supplier' })).rows[0].amountCents,
        20000
      )
      assert.equal(
        (await report('apPayments', { search: 'REPORT-AP' })).rows[0].remainingCents,
        220000
      )
      assert.equal(
        (await report('apPayments', { from: '2000-01-01', to: '2000-01-01' })).totalRows,
        0
      )
      assert.equal((await report('discounts')).rows[0].discountCents, 5000)
      const regulated = await report('regulated')
      assert.equal(regulated.totalRows, 5)
      assert.equal(metric(regulated, 'Units'), 9)
      assert.ok(regulated.rows.some((row) => row.isControlled === 1))
      assert.ok(regulated.rows.some((row) => row.isPrescribed === 1))
      assert.equal((await report('products', { search: 'Report Alpha' })).rows[0].stock, 19)
      for (const invalid of [
        { from: '2026-02-30' },
        { from: '2099-01-01', to: '2000-01-01' },
        { page: 0 },
        { kind: 'unknown' }
      ])
        await bad(channels.reporting.generate, { ...filter('sales'), ...invalid })
      for (const account of [undefined, staff, cashier]) {
        state.session = account ? { account } : undefined
        await bad(channels.reporting.generate, filter('financial'))
        await bad(channels.reporting.export, filter('financial'))
      }
      state.session = { account: admin }
      const saveDialog = dialog.showSaveDialog
      dialog.showSaveDialog = async () => {
        state.session = { account: staff }
        return { canceled: false, filePath: process.env.INVENTORY_TEST_EXPORT }
      }
      await bad(channels.reporting.export, filter('financial'))
      dialog.showSaveDialog = saveDialog
      state.session = { account: admin }
      const text = reportCsv({ ...sales, rows: [{ ...sales.rows[0], customerName: '=1+1' }] })
      assert.ok(text.includes("'=1+1"))
      const { createElement } = await import('react')
      const { renderToStaticMarkup } = await import('react-dom/server')
      const { ReportTable } =
        await import('../src/renderer/src/components/reporting/ReportingWorkspace.tsx')
      assert.ok(
        renderToStaticMarkup(createElement(ReportTable, { report: sales })).includes('Report Alpha')
      )
      assert.ok(
        renderToStaticMarkup(
          createElement(ReportTable, { report: { ...sales, rows: [] } })
        ).includes('No matching records')
      )
      const copies = []
      const { id: ignored, items: ignoredItems, ...copy } = sale
      void ignored
      void ignoredItems
      for (let index = 0; index < 101; index++)
        copies.push({ ...copy, requestId: randomUUID(), reference: `PAGE-FIXTURE-${index}` })
      await db.insertInto('sales').values(copies).execute()
      const page = await report('sales')
      assert.equal(page.totalRows, 103)
      assert.equal(page.rows.length, 100)
      assert.equal((await report('sales', { page: 2 })).rows.length, 3)
      const full = await generateReport(filter('sales'), true)
      assert.equal(full.rows.length, 103)
      assert.equal(metric(page, 'Retail revenue'), 2051200)
      await db.deleteFrom('sales').where('reference', 'like', 'PAGE-FIXTURE-%').execute()
      await ok(channels.reporting.export, filter('arPayments'))
      const csv = await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8')
      assert.ok(csv.includes('FINAL-AR'))
      assert.ok(csv.includes('348.00'))
      await db.updateTable('accounts').set({ isArchived: 1 }).where('id', '=', admin.id).execute()
      await bad(channels.reporting.generate, filter('sales'))
      await db
        .updateTable('accounts')
        .set({ isArchived: 0, isVerified: 0 })
        .where('id', '=', admin.id)
        .execute()
      state.session = { account: admin }
      await bad(channels.reporting.generate, filter('sales'))
      await db.updateTable('accounts').set({ isVerified: 1 }).where('id', '=', admin.id).execute()
      console.log(
        'PASS: all report queries, period boundaries, persisted source totals, cost valuation, movement ranking, discounts/regulated flags, cash consistency/mismatch, AR/AP filters/balances, overdue cleared by payment, pagination/full export, CSV escaping, report rendering, authorization/session changes'
      )
    }
  } finally {
    await db.destroy()
  }
}
