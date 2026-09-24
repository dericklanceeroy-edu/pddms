/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node harness uses JavaScript. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.INVENTORY_TEST_DATABASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-inventory-test-'))
  try {
    const invoicePath = join(directory, 'supplier-invoice.pdf')
    await writeFile(invoicePath, '%PDF-1.4\n% PDDMS supplier invoice test\n')
    for (const phase of ['workflow', 'restart']) {
      const child = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--experimental-loader',
          new URL('./inventory-test-loader.mjs', import.meta.url).href,
          fileURLToPath(import.meta.url),
          phase
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            DATABASE: join(directory, 'test.db'),
            DATABASE_BACKUP: join(directory, 'backup.db'),
            INVENTORY_TEST_DATABASE: '1',
            INVENTORY_TEST_EXPORT: join(directory, 'inventory.csv'),
            INVENTORY_TEST_INVOICE: invoicePath,
            INVENTORY_TEST_USER_DATA: directory
          }
        }
      )
      assert.equal(child.status, 0, `${phase} failed`)
    }
  } finally {
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  const { findAll } = await import('../src/main/product/repository.ts')
  const { recordStockOut, inventoryCsv } = await import('../src/main/inventory/repository.ts')
  const { findInvoices, findPaymentSummaries, insertInvoice } =
    await import('../src/main/procurement/repository.ts')
  const { getAdminDashboard } = await import('../src/main/dashboard/repository.ts')
  const { getExpiryStatus, localDate, isBatchSellable } = await import('../src/shared/inventory.ts')
  await import('../src/main/product/controller.ts')
  await import('../src/main/customer/controller.ts')
  await import('../src/main/auth/controller.ts')
  await import('../src/main/purchase-order/controller.ts')
  await import('../src/main/procurement/controller.ts')
  await import('../src/main/inventory/controller.ts')
  await initializeDatabase()
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const success = async (channel, ...args) => {
    const response = await invoke(channel, ...args)
    assert.equal(response.success, true, response.error)
    return response
  }
  const denied = async (channel, ...args) => {
    const response = await invoke(channel, ...args)
    assert.equal(response.success, false)
    return response
  }
  const offsetDate = (days) => {
    const value = new Date()
    value.setDate(value.getDate() + days)
    return localDate(value)
  }
  try {
    if (process.argv[2] === 'restart') {
      const admin = await db
        .selectFrom('accounts')
        .selectAll()
        .where('username', '=', 'inventory-admin')
        .executeTakeFirstOrThrow()
      state.session = { account: admin }
      const products = await findAll()
      assert.equal(products[0].brandName, 'Inventory Updated')
      assert.equal(
        products[0].batches.reduce((sum, batch) => sum + batch.stock, 0),
        10
      )
      assert.equal(products[0].batches[0].receipts.length, 2)
      assert.equal((await db.selectFrom('stockOuts').selectAll().execute()).length, 3)
      assert.equal((await db.selectFrom('supplierDeliveries').selectAll().execute()).length, 3)
      assert.equal(
        (
          await db
            .selectFrom('customers')
            .select('fullName')
            .where('phone', '=', '09171234567')
            .executeTakeFirstOrThrow()
        ).fullName,
        'Updated Customer'
      )
      assert.ok((await inventoryCsv()).includes('Inventory Updated'))
      const records = await success(channels.procurement.getRecords)
      assert.equal(records.invoices.length, 2)
      assert.equal(records.payments.length, 3)
      await success(
        channels.procurement.openInvoice,
        records.invoices.find((invoice) => invoice.invoiceNumber === 'INV-FUTURE').id
      )
      console.log(
        'PASS: database reopen, migrations repeat safely, product / receipts / stock / expiry / adjustments / invoices / payments / report persist; stored invoice reopens'
      )
    } else {
      const admin = await db
        .insertInto('accounts')
        .values({
          role: 'master',
          username: 'inventory-admin',
          fullName: 'Inventory Admin',
          password: 'unused-test-password'
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const supplier = await db
        .insertInto('suppliers')
        .values({
          organization: 'Inventory Test Supplier',
          person: 'Test Contact',
          phone: '09170000000',
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
      const { hash } = await import('argon2')
      const password = await hash('SecurePass123')
      await db
        .insertInto('accounts')
        .values([
          {
            role: 'cashier',
            username: 'verified-cashier',
            fullName: 'Verified Cashier',
            password,
            isArchived: 0,
            isVerified: 1
          },
          {
            role: 'staff',
            username: 'verified-staff',
            fullName: 'Verified Staff',
            password,
            isArchived: 0,
            isVerified: 1
          },
          {
            role: 'staff',
            username: 'blocked-staff',
            fullName: 'Blocked Staff',
            password,
            isArchived: 1,
            isVerified: 1
          },
          {
            role: 'staff',
            username: 'unverified-staff',
            fullName: 'Unverified Staff',
            password,
            isArchived: 0,
            isVerified: 0
          }
        ])
        .execute()
      state.session = undefined
      assert.match(
        (
          await denied(channels.auth.signIn, {
            username: 'blocked-staff',
            password: 'SecurePass123'
          })
        ).error,
        /blocked/i
      )
      assert.match(
        (
          await denied(channels.auth.signIn, {
            username: 'unverified-staff',
            password: 'SecurePass123'
          })
        ).error,
        /verified/i
      )
      await success(channels.auth.signIn, {
        username: 'verified-staff',
        password: 'SecurePass123'
      })
      await denied(channels.inventory.exportReport)
      await success(channels.auth.signOut)
      await denied(channels.product.getAll)
      state.session = { account: admin }
      assert.match(
        (
          await denied(channels.customer.createOne, {
            fullName: 'Invalid Customer',
            phone: '123',
            email: null,
            address: null,
            discountType: 'none',
            discountId: null,
            discountExpiresAt: null
          })
        ).error,
        /phone/i
      )
      const customer = (
        await success(channels.customer.createOne, {
          fullName: 'Valid Customer',
          phone: '09171234567',
          email: 'customer@example.com',
          address: 'General Santos City',
          discountType: 'none',
          discountId: null,
          discountExpiresAt: null
        })
      ).customer
      await success(channels.customer.updateOneById, customer.id, {
        fullName: 'Updated Customer',
        phone: '09171234567',
        email: 'customer@example.com',
        address: 'General Santos City',
        discountType: 'none',
        discountId: null,
        discountExpiresAt: null
      })
      const input = {
        brandName: 'Inventory Test',
        genericName: 'Generic',
        category: 'Medicine',
        formulation: '500 mg tablet',
        isPrescribed: false,
        isControlled: false,
        reorderLevel: 10
      }
      state.session = undefined
      await denied(channels.product.createOne, input)
      state.session = {
        account: await db
          .selectFrom('accounts')
          .selectAll()
          .where('username', '=', 'verified-cashier')
          .executeTakeFirstOrThrow()
      }
      await denied(channels.product.createOne, input)
      state.session = { account: admin }
      assert.match(
        (await denied(channels.product.createOne, { ...input, reorderLevel: -1 })).error,
        /Reorder level/
      )
      assert.match(
        (await denied(channels.product.createOne, { ...input, brandName: '' })).error,
        /brand name/i
      )
      const { product } = await success(channels.product.createOne, input)
      globalThis.window = { electron: { ipcRenderer: { invoke } } }
      const { useProfileStore } = await import('../src/renderer/src/stores/useProfileStore.ts')
      const { getItemStock, getSellableStock } =
        await import('../src/renderer/src/data/profiles.ts')
      await useProfileStore.getState().loadItems(true)
      assert.equal(getItemStock(useProfileStore.getState().items[0]), 0)
      await denied(channels.product.createOne, { ...input, brandName: 'inventory test' })
      await success(channels.product.updateOneById, product.id, { brandName: 'Inventory Updated' })
      assert.equal((await findAll())[0].brandName, 'Inventory Updated')
      const second = (
        await success(channels.product.createOne, { ...input, brandName: 'Other Product' })
      ).product
      await denied(channels.product.updateOneById, second.id, { brandName: 'Inventory Updated' })
      await success(channels.product.removeOneById, second.id)
      const { order } = await success(channels.purchaseOrder.createOne, {
        supplierId: supplier.id,
        expectedAt: localDate(),
        notes: null,
        items: [{ drugId: product.id, quantity: 20, unitCost: 10 }]
      })
      await success(channels.purchaseOrder.updateStatusById, order.id, { status: 'submitted' })
      const delivery = (quantity, expiresAt = offsetDate(30), batchNumber = 'TEST-NEAR') => ({
        deliveredAt: offsetDate(-10),
        notes: null,
        items: [
          {
            itemId: order.items[0].id,
            receivedQuantity: quantity,
            batchNumber,
            sellPrice: 15,
            expiresAt
          }
        ]
      })
      await denied(channels.purchaseOrder.recordDeliveryById, order.id, delivery(21))
      await denied(channels.purchaseOrder.recordDeliveryById, order.id, delivery(-1))
      await denied(channels.purchaseOrder.recordDeliveryById, order.id, delivery(1, '2026-02-30'))
      await denied(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery(1),
        items: [...delivery(1).items, { ...delivery(1).items[0], itemId: 999999 }]
      })
      assert.equal((await db.selectFrom('batches').selectAll().execute()).length, 0)
      assert.equal((await db.selectFrom('supplierDeliveries').selectAll().execute()).length, 0)
      await success(channels.purchaseOrder.recordDeliveryById, order.id, delivery(12))
      await success(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery(1),
        items: [
          ...delivery(4).items,
          ...delivery(2, offsetDate(-1), 'TEST-EXPIRED').items,
          ...delivery(2, offsetDate(91), 'TEST-FRESH').items
        ]
      })
      assert.equal((await success(channels.purchaseOrder.getAll)).orders[0].status, 'received')
      await success(channels.procurement.recordPayment, {
        purchaseOrderId: order.id,
        invoiceId: null,
        amount: 40,
        paidAt: localDate(),
        method: 'Bank transfer',
        referenceNumber: 'PAY-001',
        notes: null
      })
      let paymentSummary = (await findPaymentSummaries()).find(
        (summary) => summary.purchaseOrderId === order.id
      )
      assert.equal(paymentSummary.paidAmount, 40)
      assert.equal(paymentSummary.outstandingAmount, 160)
      assert.equal(paymentSummary.status, 'partially_paid')
      const uploaded = await success(channels.procurement.uploadInvoice, {
        purchaseOrderId: order.id,
        invoiceNumber: 'INV-FUTURE',
        invoiceDate: localDate(),
        dueDate: offsetDate(30),
        amount: 100
      })
      const overdueInvoice = await insertInvoice({
        purchaseOrderId: order.id,
        invoiceNumber: 'INV-OVERDUE',
        invoiceDate: offsetDate(-30),
        dueDate: offsetDate(-1),
        amount: 100,
        originalFilename: 'supplier-invoice-2.pdf',
        storedFilename: 'test-second-invoice.pdf',
        mimeType: 'application/pdf',
        fileSize: 32,
        uploadedBy: admin.id
      })
      let invoiceRecords = await findInvoices()
      assert.equal(
        invoiceRecords.find((invoice) => invoice.id === overdueInvoice.id).deadlineStatus,
        'overdue'
      )
      assert.equal(
        invoiceRecords.find((invoice) => invoice.id === uploaded.invoice.id).deadlineStatus,
        'upcoming'
      )
      assert.equal(
        invoiceRecords.find((invoice) => invoice.id === overdueInvoice.id).paidAmount,
        40
      )
      await success(channels.procurement.recordPayment, {
        purchaseOrderId: order.id,
        invoiceId: uploaded.invoice.id,
        amount: 60,
        paidAt: localDate(),
        method: 'Bank transfer',
        referenceNumber: 'PAY-002',
        notes: null
      })
      assert.match(
        (
          await denied(channels.procurement.recordPayment, {
            purchaseOrderId: order.id,
            invoiceId: uploaded.invoice.id,
            amount: 50,
            paidAt: localDate(),
            method: 'Bank transfer',
            referenceNumber: 'PAY-OVER-INVOICE',
            notes: null
          })
        ).error,
        /invoice balance/i
      )
      assert.match(
        (
          await denied(channels.procurement.recordPayment, {
            purchaseOrderId: order.id,
            invoiceId: null,
            amount: 1,
            paidAt: localDate(),
            method: 'Bank transfer',
            referenceNumber: 'PAY-001',
            notes: null
          })
        ).error,
        /reference/i
      )
      assert.match(
        (
          await denied(channels.procurement.recordPayment, {
            purchaseOrderId: order.id,
            invoiceId: null,
            amount: 1,
            paidAt: offsetDate(1),
            method: 'Cash',
            referenceNumber: 'PAY-FUTURE',
            notes: null
          })
        ).error,
        /future/i
      )
      await success(channels.procurement.recordPayment, {
        purchaseOrderId: order.id,
        invoiceId: null,
        amount: 100,
        paidAt: localDate(),
        method: 'Bank transfer',
        referenceNumber: 'PAY-003',
        notes: null
      })
      paymentSummary = (await findPaymentSummaries()).find(
        (summary) => summary.purchaseOrderId === order.id
      )
      assert.equal(paymentSummary.outstandingAmount, 0)
      assert.equal(paymentSummary.status, 'paid')
      invoiceRecords = await findInvoices()
      assert.ok(invoiceRecords.every((invoice) => invoice.status === 'paid'))
      assert.ok(invoiceRecords.every((invoice) => invoice.deadlineStatus === 'paid'))
      assert.match(
        (
          await denied(channels.procurement.recordPayment, {
            purchaseOrderId: order.id,
            invoiceId: null,
            amount: 1,
            paidAt: localDate(),
            method: 'Cash',
            referenceNumber: 'PAY-OVER-ORDER',
            notes: null
          })
        ).error,
        /already paid/i
      )
      let products = await findAll()
      assert.equal(
        products[0].batches.reduce((sum, batch) => sum + batch.stock, 0),
        20
      )
      const near = products[0].batches.find((batch) => batch.batchNumber === 'TEST-NEAR')
      assert.equal(near.stock, 16)
      assert.equal(near.receipts.length, 2)
      assert.equal(getExpiryStatus(offsetDate(91)), 'valid')
      assert.equal(getExpiryStatus(offsetDate(90)), 'near-expiry')
      assert.equal(getExpiryStatus(offsetDate(-1)), 'expired')
      assert.equal(getExpiryStatus('2026-02-30'), 'unknown')
      assert.equal(isBatchSellable(2, offsetDate(-1)), false)
      assert.equal(isBatchSellable(2, offsetDate(30)), true)
      const dashboard = await getAdminDashboard()
      assert.equal(dashboard.expiryAlerts.length, 2)
      assert.ok(dashboard.expiryAlerts.some((alert) => alert.expiryStatus === 'expired'))
      assert.equal(dashboard.lowStockAlerts.length, 0)
      const adjust = { batchId: near.id, quantity: 10, reason: 'Damaged stock' }
      state.session = undefined
      await denied(channels.inventory.recordStockOut, adjust)
      for (const role of ['staff', 'cashier']) {
        state.session = {
          account: await db
            .selectFrom('accounts')
            .selectAll()
            .where('username', '=', `verified-${role}`)
            .executeTakeFirstOrThrow()
        }
        await denied(channels.inventory.recordStockOut, adjust)
        await denied(channels.inventory.exportReport)
      }
      state.session = { account: admin }
      await denied(channels.inventory.recordStockOut, { ...adjust, quantity: 100 })
      await denied(channels.inventory.recordStockOut, { ...adjust, quantity: -1 })
      await denied(channels.inventory.recordStockOut, { ...adjust, quantity: 0 })
      await denied(channels.inventory.recordStockOut, { ...adjust, quantity: 1.5 })
      await assert.rejects(recordStockOut(adjust, 999999))
      assert.equal((await findAll())[0].batches.find((batch) => batch.id === near.id).stock, 16)
      await success(channels.inventory.recordStockOut, adjust)
      assert.equal((await getAdminDashboard()).lowStockAlerts[0].stockRemaining, 8)
      await success(channels.inventory.recordStockOut, { ...adjust, quantity: 1 })
      assert.equal((await getAdminDashboard()).lowStockAlerts[0].stockRemaining, 7)
      const results = await Promise.all([
        invoke(channels.inventory.recordStockOut, { ...adjust, quantity: 5 }),
        invoke(channels.inventory.recordStockOut, { ...adjust, quantity: 5 })
      ])
      assert.equal(results.filter((result) => result.success).length, 1)
      assert.equal((await findAll())[0].batches.find((batch) => batch.id === near.id).stock, 0)
      // Restore stock through another valid PO delivery, retaining adjustment history.
      const next = (
        await success(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: [{ drugId: product.id, quantity: 6, unitCost: 10 }]
        })
      ).order
      await success(channels.purchaseOrder.updateStatusById, next.id, { status: 'submitted' })
      await success(channels.purchaseOrder.recordDeliveryById, next.id, {
        deliveredAt: localDate(),
        items: [
          {
            itemId: next.items[0].id,
            receivedQuantity: 6,
            batchNumber: 'TEST-RESTOCK',
            sellPrice: 15,
            expiresAt: offsetDate(100)
          }
        ]
      })
      products = (await success(channels.product.getAll)).products
      assert.equal(
        products[0].batches.reduce((sum, batch) => sum + batch.stock, 0),
        10
      )
      await useProfileStore.getState().loadItems(true)
      const renderedItem = useProfileStore.getState().items[0]
      assert.equal(getItemStock(renderedItem), 10)
      assert.equal(getSellableStock(renderedItem), 8)
      const { createElement } = await import('react')
      const { renderToStaticMarkup } = await import('react-dom/server')
      const { default: InventoryReport } =
        await import('../src/renderer/src/components/profiles/InventoryReport.tsx')
      const html = renderToStaticMarkup(createElement(InventoryReport, { items: [renderedItem] }))
      assert.ok(html.includes('Inventory Updated'))
      assert.ok(html.includes('10 / 8'))
      assert.ok(html.includes('Expired — not sellable'))
      const { records } = await success(channels.inventory.getStockOuts, product.id)
      assert.equal(records.length, 3)
      assert.ok(records.every((record) => record.recordedByName === admin.fullName))
      await success(channels.inventory.exportReport)
      const report = await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8')
      assert.ok(report.includes('Inventory Updated'))
      assert.ok(report.includes('Expired — not sellable'))
      assert.ok(report.includes('TEST-RESTOCK'))
      assert.ok(report.includes('"10","8","10","Low stock"'))
      assert.equal((await db.selectFrom('supplierDeliveries').selectAll().execute()).length, 3)
      console.log(
        'PASS: IPC validation / roles, product CRUD / duplicate prevention, atomic delivery / batch stock-in, expiry boundaries / alerts, stock-out / rollback / concurrent overdraw, low-stock boundaries, renderer store refresh / report render, live CSV export'
      )
    }
  } finally {
    await db.destroy()
  }
}
