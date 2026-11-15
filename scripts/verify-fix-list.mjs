/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
/**
 * Verifies the November 15 fix list end to end through the IPC handlers: the supplier price list
 * and pack sizes, receiving differences and rejected boxes, batch box sizes in wholesale,
 * duplicate customers and pharmacy clients with merge, archive instead of delete, retail voids
 * with administrator approval, soonest-expiry-first batches, the dangerous drugs register,
 * write-off reasons and the losses report, supplier returns and credit notes, audit details,
 * stock counts and the end-of-day cash count.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.FIX_LIST_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-fix-list-test-'))
  try {
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
          FIX_LIST_TEST_PHASE: 'workflow',
          DATABASE: join(directory, 'fix-list.db'),
          INVENTORY_TEST_USER_DATA: directory,
          INVENTORY_TEST_EXPORT: join(directory, 'register.csv')
        }
      }
    )
    assert.equal(child.status, 0, 'workflow failed')
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-fix-list-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { receiptText } = await import('../src/shared/sales.ts')
  const { receiptPlainText, receiptHtml } = await import('../src/shared/receipt.ts')
  const { handlers, dialog } = await import('./inventory-test-electron.mjs')
  const { sql } = await import('kysely')
  const { hash } = await import('argon2')
  for (const module of [
    'auth',
    'administration',
    'customer',
    'supplier',
    'product',
    'price-list',
    'purchase-order',
    'procurement',
    'sales',
    'wholesale',
    'inventory',
    'supplier-return',
    'reporting'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, `${channel}: ${result.error}`)
    return result
  }
  const bad = async (channel, pattern, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, `${channel} should fail: ${JSON.stringify(result)}`)
    if (pattern) assert.match(result.error ?? '', pattern)
    return result
  }
  const today = localDate()
  const addDays = (offset) => {
    const value = new Date()
    value.setDate(value.getDate() + offset)
    return localDate(value)
  }
  const stock = async (batchId) =>
    (
      await db
        .selectFrom('batches')
        .select('currentStock')
        .where('id', '=', batchId)
        .executeTakeFirstOrThrow()
    ).currentStock
  const batchByTag = (tag) =>
    db.selectFrom('batches').selectAll().where('physicalTag', '=', tag).executeTakeFirstOrThrow()
  const lastAudit = (action) =>
    db
      .selectFrom('auditLogs')
      .selectAll()
      .where('action', '=', action)
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow()
  const report = async (kind) =>
    (
      await ok(channels.reporting.generate, {
        kind,
        from: today,
        to: today,
        search: '',
        page: 1
      })
    ).report
  const metric = (data, label) => data.metrics.find((item) => item.label === label)?.value

  const password = await hash('FixListTest123')
  const account = (role, username, fullName) =>
    db
      .insertInto('accounts')
      .values({ role, username, fullName, password })
      .returningAll()
      .executeTakeFirstOrThrow()
  const admin = await account('master', 'fix-admin', 'Fix Admin')
  const staff = await account('staff', 'fix-staff', 'Fix Staff')
  const cashier = await account('cashier', 'fix-cashier', 'Fix Cashier')
  const as = (who) => {
    state.session = { account: who }
  }
  as(admin)

  const supplierInput = (organization) => ({
    organization,
    person: 'Ana Reyes',
    phone: '09170000001',
    telephone: null,
    email: null,
    street: 'Street',
    city: 'City',
    province: 'Province',
    country: 'Philippines',
    postalCode: '1000',
    pdeaLicense: 'PDEA-S3-0001'
  })
  const supplier = (await ok(channels.supplier.createOne, supplierInput('Fix Supplier'))).supplier
  const otherSupplier = (await ok(channels.supplier.createOne, supplierInput('Other Supplier')))
    .supplier
  const product = async (brandName, extra = {}) =>
    (
      await ok(channels.product.createOne, {
        brandName,
        genericName: 'Generic',
        formulation: '500 mg Tablet',
        category: 'Medicine',
        isPrescribed: false,
        isControlled: false,
        reorderLevel: 5,
        ...extra
      })
    ).product
  const tablet = await product('Fix Tablet')
  const controlled = await product('Fix Diazepam', {
    genericName: 'Diazepam',
    formulation: '5 mg Tablet',
    isPrescribed: true,
    isControlled: true
  })

  // 1-2. Supplier price list: the owner records each pack size with its agreed cost per box.
  const newPack = (fields) => ({
    supplierId: supplier.id,
    drugId: tablet.id,
    effectiveFrom: today,
    quotationReference: 'Q-2026-11',
    ...fields
  })
  as(staff)
  await bad(channels.priceList.createPack, null, newPack({ piecesPerBox: 50, unitCost: 400 }))
  as(admin)
  const pack50 = (await ok(channels.priceList.createPack, newPack({ piecesPerBox: 50, unitCost: 400 })))
    .data
  const pack100 = (
    await ok(channels.priceList.createPack, newPack({ piecesPerBox: 100, unitCost: 750 }))
  ).data
  await bad(channels.priceList.createPack, /already|exists/i, newPack({ piecesPerBox: 50, unitCost: 1 }))
  const controlledPack = (
    await ok(
      channels.priceList.createPack,
      newPack({ drugId: controlled.id, piecesPerBox: 10, unitCost: 100 })
    )
  ).data
  const otherPack = (
    await ok(
      channels.priceList.createPack,
      newPack({ supplierId: otherSupplier.id, piecesPerBox: 50, unitCost: 390 })
    )
  ).data
  // A future price is shown as upcoming and does not change today's orders.
  await ok(channels.priceList.updatePrice, {
    packId: pack50,
    unitCost: 450,
    effectiveFrom: addDays(30),
    quotationReference: 'Q-2026-12'
  })
  const priceChange = await lastAudit(channels.priceList.updatePrice)
  assert.match(priceChange.details, /450/)
  as(staff)
  const list = (await ok(channels.priceList.getAll)).packs
  const listed50 = list.find((pack) => pack.id === pack50)
  assert.equal(listed50.current.unitCost, 400)
  assert.equal(listed50.upcoming.unitCost, 450)
  await bad(channels.priceList.updatePrice, null, {
    packId: pack50,
    unitCost: 1,
    effectiveFrom: today,
    quotationReference: null
  })

  // Staff order packs; the cost comes from the list and cannot be typed. A pack of another
  // supplier is refused.
  await bad(channels.purchaseOrder.createOne, null, {
    supplierId: supplier.id,
    items: [{ packId: pack50, quantity: 2, unitCost: 1 }]
  })
  await bad(channels.purchaseOrder.createOne, /supplier/i, {
    supplierId: supplier.id,
    items: [{ packId: otherPack, quantity: 2 }]
  })
  const draft = (
    await ok(channels.purchaseOrder.createOne, {
      supplierId: supplier.id,
      items: [
        { packId: pack50, quantity: 4 },
        { packId: pack100, quantity: 2 },
        { packId: controlledPack, quantity: 3 }
      ]
    })
  ).order
  assert.equal(draft.totalAmount, 4 * 400 + 2 * 750 + 3 * 100)
  const order = (
    await ok(channels.purchaseOrder.updateStatusById, draft.id, { status: 'submitted' })
  ).order
  const line = (packId) => order.items.find((item) => item.packId === packId)
  assert.equal(line(pack100).piecesPerUnit, 100)

  // 13 and receiving differences: one box of 50 is crushed and rejected; the 100-piece boxes
  // arrive as boxes of 90 at a different invoice cost, which needs a reason.
  const delivery = (items) => ({
    requestId: randomUUID(),
    deliveredAt: today,
    notes: null,
    deliveredByName: 'Supplier Driver',
    checkedByName: 'Receiving Clerk',
    items
  })
  const receive50 = {
    itemId: line(pack50).id,
    receivedQuantity: 3,
    rejectedQuantity: 1,
    rejectionReason: 'Crushed box',
    batchNumber: 'FX-50',
    sellPrice: 12,
    boxSellPrice: 550,
    expiresAt: addDays(400)
  }
  const receive100 = {
    itemId: line(pack100).id,
    receivedQuantity: 2,
    piecesPerBox: 90,
    unitCost: 720,
    batchNumber: 'FX-100',
    sellPrice: 12,
    boxSellPrice: 1000,
    expiresAt: addDays(200)
  }
  const receiveControlled = {
    itemId: line(controlledPack).id,
    receivedQuantity: 3,
    batchNumber: 'DZ-1',
    sellPrice: 15,
    expiresAt: addDays(300)
  }
  await bad(
    channels.purchaseOrder.recordDeliveryById,
    /differs from the order/,
    order.id,
    delivery([receive100])
  )
  await bad(channels.purchaseOrder.recordDeliveryById, null, order.id, {
    ...delivery([{ ...receive50, rejectionReason: '' }])
  })
  await ok(
    channels.purchaseOrder.recordDeliveryById,
    order.id,
    delivery([
      receive50,
      { ...receive100, differenceReason: 'Supplier only had boxes of 90' },
      receiveControlled
    ])
  )
  const batch50 = await batchByTag('FX-50')
  const batch90 = await batchByTag('FX-100')
  const controlledBatch = await batchByTag('DZ-1')
  assert.equal(batch50.currentStock, 150)
  assert.equal(batch50.piecesPerBox, 50)
  assert.equal(batch50.buyPrice, 8)
  assert.equal(batch90.currentStock, 180)
  assert.equal(batch90.piecesPerBox, 90)
  assert.equal(batch90.buyPrice, 8)
  const rejection = await db
    .selectFrom('supplierDeliveryRejections')
    .selectAll()
    .executeTakeFirstOrThrow()
  assert.deepEqual([rejection.quantity, rejection.reason], [1, 'Crushed box'])
  // Payables follow what arrived at the invoice cost: 3 × 400 + 2 × 720 + 3 × 100. The rejected
  // box is not owed.
  as(admin)
  const balances = (await import('../src/main/procurement/repository.ts')).orderBalances
  const owed = (await balances(db, [order.id])).get(order.id)
  assert.equal(owed.delivered, 3 * 400 + 2 * 720 + 3 * 100)
  const differences = (await ok(channels.priceList.differences)).records
  assert.equal(differences.length, 1)
  assert.deepEqual(
    [differences[0].orderedPiecesPerBox, differences[0].deliveredPiecesPerBox],
    [100, 90]
  )
  assert.equal(differences[0].invoiceUnitCost, 720)

  // 3. Products have no box size of their own.
  await bad(channels.product.updateOneById, null, tablet.id, { piecesPerBox: 20 })

  // 10. Soonest expiry first: the 90-piece batch (200 days) is listed before the 50-piece one.
  const listed = (await ok(channels.product.getAll)).products.find((item) => item.id === tablet.id)
  assert.deepEqual(
    listed.batches.map((batch) => batch.batchNumber),
    ['FX-100', 'FX-50']
  )
  assert.deepEqual(
    listed.batches.map((batch) => batch.piecesPerBox),
    [90, 50]
  )

  // 6. Pharmacy clients: address required; same name only at another address; a shared phone or
  // TIN is a warning that can be confirmed.
  const client = (fields) => ({
    clientType: 'pharmacy',
    contactPerson: 'Grace Lim',
    fullName: 'Rose Pharmacy',
    phone: '09171110000',
    email: null,
    address: 'Main Street, Koronadal',
    tin: '123-456-789-000',
    discountType: 'none',
    discountId: null,
    discountExpiresAt: null,
    ...fields
  })
  await bad(channels.customer.createOne, null, client({ address: null }))
  const rose = (await ok(channels.customer.createOne, client())).customer
  await bad(channels.customer.createOne, /different branch/, client({ phone: '09171110001', tin: null }))
  const shared = await bad(
    channels.customer.createOne,
    /already used by another pharmacy client/,
    client({ address: 'Highway, Polomolok' })
  )
  assert.deepEqual(
    shared.duplicates.map((match) => match.id),
    [rose.id]
  )
  const roseBranch = (
    await ok(channels.customer.createOne, client({ address: 'Highway, Polomolok' }), {
      confirmDuplicate: true
    })
  ).customer
  assert.notEqual(roseBranch.id, rose.id)

  // 4. Wholesale sells boxes from each batch at that batch's box size and price.
  const wholesaleOrder = (items) => ({
    requestId: randomUUID(),
    customerId: rose.id,
    dueDate: addDays(30),
    scheduledDate: today,
    deliveryAddress: 'Main Street, Koronadal',
    notes: '',
    items
  })
  const wholesaleId = (
    await ok(
      channels.wholesale.create,
      wholesaleOrder([
        { batchId: batch50.id, quantity: 1, unit: 'box', unitPriceCents: 55000 },
        { batchId: batch90.id, quantity: 1, unit: 'box', unitPriceCents: 100000 }
      ])
    )
  ).data
  const wholesale = (await ok(channels.wholesale.get, wholesaleId)).data
  assert.deepEqual(
    wholesale.items.map((item) => item.piecesPerUnit).sort((a, b) => a - b),
    [50, 90]
  )
  await ok(channels.wholesale.deliver, {
    orderId: wholesaleId,
    driverName: 'Pedro Driver',
    receivedByName: 'Ana Pharmacist'
  })
  assert.equal(await stock(batch50.id), 100)
  assert.equal(await stock(batch90.id), 90)

  // 5. Retail customers: one mobile number and one Senior/PWD ID per person; the same name is a
  // warning that offers the existing profile; the administrator merges duplicates.
  const customer = (fields) => ({
    clientType: 'retail',
    contactPerson: null,
    fullName: 'Ana Santos',
    phone: '09172220000',
    email: null,
    address: null,
    discountType: 'senior',
    discountId: 'SC-1001',
    discountExpiresAt: null,
    ...fields
  })
  const ana = (await ok(channels.customer.createOne, customer())).customer
  await bad(channels.customer.createOne, /already belongs/, customer({ fullName: 'Ana Cruz', discountId: null, discountType: 'none' }))
  await bad(
    channels.customer.createOne,
    /already on Ana Santos/,
    customer({ fullName: 'Ana Cruz', phone: '09172220001' })
  )
  const warning = await bad(
    channels.customer.createOne,
    /already saved/,
    customer({ phone: '09172220002', discountType: 'none', discountId: null })
  )
  assert.equal(warning.duplicates[0].id, ana.id)
  assert.match(warning.duplicates[0].detail, /0000|SC/)
  const anaTwo = (
    await ok(
      channels.customer.createOne,
      customer({ phone: '09172220002', discountType: 'none', discountId: null }),
      { confirmDuplicate: true }
    )
  ).customer

  // Retail sale for the duplicate, then a merge moves it to the kept profile.
  as(cashier)
  const piece = { batchId: batch90.id, quantity: 2, unit: 'piece', unitPriceCents: 1200 }
  const checkout = (fields = {}) => ({
    requestId: randomUUID(),
    customerId: null,
    items: [piece],
    expectedTotalCents: 2400,
    cashCents: 3000,
    ...fields
  })
  const anaSale = (await ok(channels.sales.checkout, checkout({ customerId: anaTwo.id }))).sale
  await bad(channels.customer.mergeInto, null, { sourceId: anaTwo.id, targetId: ana.id })
  as(admin)
  await bad(channels.customer.mergeInto, null, { sourceId: ana.id, targetId: ana.id })
  await ok(channels.customer.mergeInto, { sourceId: anaTwo.id, targetId: ana.id })
  const moved = await db
    .selectFrom('sales')
    .select('customerId')
    .where('id', '=', anaSale.id)
    .executeTakeFirstOrThrow()
  assert.equal(moved.customerId, ana.id)
  const visible = (await ok(channels.customer.getAll)).customers
  assert.ok(!visible.some((row) => row.id === anaTwo.id))
  assert.ok((await ok(channels.customer.getArchived)).customers.some((row) => row.id === anaTwo.id))
  await bad(channels.customer.restoreOneById, /merged/, anaTwo.id)
  // Editing other details of the kept profile is not blocked by its own number.
  await ok(channels.customer.updateOneById, ana.id, customer({ address: 'Purok 1' }))
  const customerEdit = await lastAudit(channels.customer.updateOneById)
  assert.match(customerEdit.details, /Purok 1/)

  // 8. Archive instead of delete when a record has history; true delete only when never used.
  const blocked = await bad(channels.product.removeOneById, /Used in .*Archive it instead/, tablet.id)
  assert.equal(blocked.archivable, true)
  const unused = await product('Never Used')
  await ok(channels.product.removeOneById, unused.id)
  const spare = await product('Spare Tablet')
  await ok(
    channels.priceList.createPack,
    newPack({ drugId: spare.id, piecesPerBox: 10, unitCost: 50 })
  )
  const spareOrder = (
    await ok(channels.purchaseOrder.createOne, {
      supplierId: supplier.id,
      items: [
        {
          packId: (await ok(channels.priceList.getAll)).packs.find((pack) => pack.drugId === spare.id)
            .id,
          quantity: 1
        }
      ]
    })
  ).order
  await bad(channels.product.removeOneById, /Used in/, spare.id)
  await ok(channels.product.archiveOneById, spare.id)
  assert.ok(!(await ok(channels.product.getAll)).products.some((row) => row.id === spare.id))
  assert.ok((await ok(channels.product.getArchived)).products.some((row) => row.id === spare.id))
  await ok(channels.product.restoreOneById, spare.id)
  assert.ok((await ok(channels.product.getAll)).products.some((row) => row.id === spare.id))
  await ok(channels.purchaseOrder.removeOneById, spareOrder.id)
  const clientBlock = await bad(channels.customer.removeOneById, /wholesale order/, rose.id)
  assert.equal(clientBlock.archivable, true)
  await ok(channels.customer.archiveOneById, rose.id)
  await bad(
    channels.wholesale.create,
    null,
    wholesaleOrder([{ batchId: batch50.id, quantity: 1, unit: 'box', unitPriceCents: 55000 }])
  )
  await ok(channels.customer.restoreOneById, rose.id)

  // 9. Retail voids: a cashier needs an administrator's username and password; a wrong password
  // counts toward the administrator's sign-in lock. Stock goes back to the same batch.
  as(cashier)
  const sale = (await ok(channels.sales.checkout, checkout())).sale
  assert.equal(await stock(batch90.id), 86)
  await bad(channels.sales.void, /must approve/, { saleId: sale.id, reason: 'Wrong item rung up' })
  await bad(channels.sales.void, null, { saleId: sale.id, reason: 'no', approval: null })
  await bad(channels.sales.void, /incorrect/, {
    saleId: sale.id,
    reason: 'Wrong item rung up',
    approval: { username: 'fix-admin', password: 'WrongPassword1' }
  })
  assert.equal(
    (await db.selectFrom('accounts').select('failedAttempts').where('id', '=', admin.id).executeTakeFirst())
      .failedAttempts,
    1
  )
  await bad(channels.sales.void, /incorrect/, {
    saleId: sale.id,
    reason: 'Wrong item rung up',
    approval: { username: 'fix-staff', password: 'FixListTest123' }
  })
  const voided = (
    await ok(channels.sales.void, {
      saleId: sale.id,
      reason: 'Wrong item rung up',
      approval: { username: 'fix-admin', password: 'FixListTest123' }
    })
  ).sale
  assert.equal(voided.status, 'voided')
  assert.equal(voided.voidedByName, 'Fix Cashier')
  assert.equal(voided.voidApprovedByName, 'Fix Admin')
  assert.equal(await stock(batch90.id), 88)
  assert.match(receiptPlainText(voided), /\*\*\* VOID \*\*\*/)
  assert.match(receiptHtml(voided), /VOID/)
  assert.match(receiptText(voided), /VOID/)
  await bad(channels.sales.void, /already voided/, {
    saleId: sale.id,
    reason: 'Wrong item rung up',
    approval: { username: 'fix-admin', password: 'FixListTest123' }
  })
  const voidAudit = await db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', channels.sales.void)
    .where('result', '=', 'success')
    .executeTakeFirstOrThrow()
  assert.match(voidAudit.details, /Wrong item rung up/)
  // Voided sales stay in history but are left out of totals.
  as(admin)
  const salesReport = await report('sales')
  assert.ok(!salesReport.rows.some((row) => row.reference === sale.reference))
  const voidsReport = await report('voids')
  assert.deepEqual(
    voidsReport.rows.map((row) => row.reference),
    [sale.reference]
  )

  // 11. Controlled drugs: checkout asks for the register details; the register lists every
  // movement with a running balance.
  as(cashier)
  const rxLine = { batchId: controlledBatch.id, quantity: 4, unit: 'piece', unitPriceCents: 1500 }
  const prescription = {
    prescriberName: 'Dr. Jose Rizal',
    prescriberLicense: 'PRC-12345',
    prescriptionNumber: 'SPFDD-0001',
    patientName: 'Pedro Reyes',
    patientAge: 54,
    patientAddress: 'Purok 2, Koronadal',
    prescriberAddress: 'Clinic Road, Koronadal',
    prescriberS2License: 'S2-7788'
  }
  const rxCheckout = (rx) =>
    checkout({ items: [rxLine], expectedTotalCents: 6000, cashCents: 6000, prescription: rx })
  await bad(channels.sales.checkout, /S2/, rxCheckout({ ...prescription, prescriberS2License: '' }))
  await bad(channels.sales.checkout, /address/, rxCheckout({ ...prescription, patientAddress: '' }))
  const rxSale = (await ok(channels.sales.checkout, rxCheckout(prescription))).sale
  assert.equal(rxSale.prescriberS2License, 'S2-7788')
  assert.equal(rxSale.patientAge, 54)
  as(admin)
  await ok(channels.inventory.recordStockOut, {
    batchId: controlledBatch.id,
    quantity: 1,
    reasonCode: 'damaged',
    reason: ''
  })
  const register = (await ok(channels.inventory.register, { drugId: controlled.id, from: today, to: today }))
    .register
  assert.equal(register.openingBalance, 0)
  assert.deepEqual(
    register.entries.map((entry) => [entry.kind, entry.quantityIn, entry.quantityOut, entry.balance]),
    [
      ['received', 30, 0, 30],
      ['dispensed', 0, 4, 26],
      ['write_off', 0, 1, 25]
    ]
  )
  const dispensed = register.entries[1]
  assert.match(dispensed.patient, /Pedro Reyes/)
  assert.match(dispensed.patient, /Purok 2/)
  assert.equal(dispensed.s2License, 'S2-7788')
  assert.equal(dispensed.prescriptionNumber, 'SPFDD-0001')
  assert.match(register.entries[0].supplier, /Fix Supplier/)
  assert.equal(register.closingBalance, 25)
  assert.equal(register.stockOnHand, 25)
  assert.equal(register.unexplained, 0)
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: process.env.INVENTORY_TEST_EXPORT })
  await ok(channels.inventory.exportRegister, { drugId: controlled.id, from: today, to: today })
  const csv = await readFile(process.env.INVENTORY_TEST_EXPORT, 'utf8')
  assert.match(csv, /S2-7788/)
  as(cashier)
  await bad(channels.inventory.register, null, { drugId: controlled.id, from: today, to: today })

  // 12. Write-offs use a fixed reason; "Other" needs a description. The losses report adds them
  // up by reason at cost.
  as(admin)
  await bad(channels.inventory.recordStockOut, null, {
    batchId: batch50.id,
    quantity: 1,
    reason: 'broken'
  })
  await bad(channels.inventory.recordStockOut, null, {
    batchId: batch50.id,
    quantity: 1,
    reasonCode: 'other',
    reason: ''
  })
  await ok(channels.inventory.recordStockOut, {
    batchId: batch50.id,
    quantity: 5,
    reasonCode: 'expired',
    reason: ''
  })
  await ok(channels.inventory.recordStockOut, {
    batchId: batch50.id,
    quantity: 1,
    reasonCode: 'other',
    reason: 'Taken as sample'
  })
  const losses = await report('losses')
  assert.equal(metric(losses, 'Loss: Expired'), 4000)
  assert.equal(metric(losses, 'Loss: Other'), 800)
  assert.equal(metric(losses, 'Loss: Damaged or broken'), 1000)

  // 14. Supplier returns lower stock (not a loss); the credit note lowers what is owed.
  await ok(channels.supplierReturn.recordReturn, {
    batchId: batch50.id,
    quantity: 10,
    reasonCode: 'near_expiry',
    notes: '',
    returnedAt: today
  })
  assert.equal(await stock(batch50.id), 84)
  const returned = (await ok(channels.supplierReturn.getAll)).returns
  assert.equal(returned[0].costValue, 80)
  await bad(channels.supplierReturn.recordCreditNote, /owes only/, {
    supplierId: supplier.id,
    creditNoteNumber: 'CN-1',
    issuedAt: today,
    amount: 5000,
    purchaseOrderId: order.id,
    returnIds: [returned[0].id]
  })
  await ok(channels.supplierReturn.recordCreditNote, {
    supplierId: supplier.id,
    creditNoteNumber: 'CN-1',
    issuedAt: today,
    amount: 80,
    purchaseOrderId: order.id,
    returnIds: [returned[0].id]
  })
  await bad(channels.supplierReturn.recordCreditNote, /CN-1/, {
    supplierId: supplier.id,
    creditNoteNumber: 'CN-1',
    issuedAt: today,
    amount: 10
  })
  const afterCredit = (await balances(db, [order.id])).get(order.id)
  assert.equal(afterCredit.outstanding, owed.outstanding - 80)
  const paymentSummary = (await ok(channels.procurement.getRecords)).paymentSummaries.find(
    (row) => row.purchaseOrderId === order.id
  )
  assert.equal(paymentSummary.creditAmount, 80)
  // A credit kept for later is applied to an order afterwards.
  const laterId = (
    await ok(channels.supplierReturn.recordCreditNote, {
      supplierId: supplier.id,
      creditNoteNumber: 'CN-2',
      issuedAt: today,
      amount: 20
    })
  ).data
  await bad(channels.supplierReturn.applyCreditNote, /same supplier/, {
    creditNoteId: laterId,
    purchaseOrderId: (
      await ok(channels.purchaseOrder.createOne, {
        supplierId: otherSupplier.id,
        items: [{ packId: otherPack, quantity: 1 }]
      })
    ).order.id
  })
  await ok(channels.supplierReturn.applyCreditNote, { creditNoteId: laterId, purchaseOrderId: order.id })
  assert.equal((await balances(db, [order.id])).get(order.id).outstanding, owed.outstanding - 100)
  // Returns are not losses.
  assert.equal(metric(await report('losses'), 'Loss: Near expiry'), undefined)

  // 16. Stock count: raise and lower stock with reasons in one step.
  const countId = (await ok(channels.inventory.startCount, { drugId: tablet.id, notes: '' })).data
  await bad(channels.inventory.startCount, /open/i, { drugId: null, notes: '' })
  const sheet = (await ok(channels.inventory.getCount, countId)).count
  assert.deepEqual(
    sheet.lines.map((row) => [row.batchNumber, row.expected]),
    [
      ['FX-100', 88],
      ['FX-50', 84]
    ]
  )
  await ok(channels.inventory.recordCountLines, {
    countId,
    lines: [
      { batchId: batch90.id, counted: 90, reason: '' },
      { batchId: batch50.id, counted: 80, reason: '' }
    ]
  })
  await bad(channels.inventory.completeCount, /reason/i, countId)
  await ok(channels.inventory.recordCountLines, {
    countId,
    lines: [
      { batchId: batch90.id, counted: 90, reason: 'Found a strip behind the shelf' },
      { batchId: batch50.id, counted: 80, reason: 'Missing after recount' }
    ]
  })
  await ok(channels.inventory.completeCount, countId)
  assert.equal(await stock(batch90.id), 90)
  assert.equal(await stock(batch50.id), 80)
  const adjustments = await db.selectFrom('stockAdjustments').selectAll().execute()
  assert.deepEqual(
    adjustments.map((row) => row.change).sort((a, b) => a - b),
    [-4, 2]
  )
  await bad(channels.inventory.recordCountLines, null, {
    countId,
    lines: [{ batchId: batch90.id, counted: 1, reason: 'late' }]
  })
  const countAudit = await lastAudit(channels.inventory.completeCount)
  assert.match(countAudit.details, /88/)

  // 17. End-of-day cash count: expected = float + today's completed cash sales (voids excluded).
  as(cashier)
  const preview = (await ok(channels.sales.cashCountPreview)).preview
  assert.equal(preview.cashSalesCents, 2400 + 6000)
  assert.equal(preview.voidedCount, 1)
  const count = (
    await ok(channels.sales.recordCashCount, {
      openingFloatCents: 100000,
      denominations: { 1000: 1, 50: 1, 20: 1, 5: 2 },
      notes: 'Short by 4 pesos'
    })
  ).count
  assert.equal(count.expectedCents, 108400)
  assert.equal(count.countedCents, 108000)
  assert.equal(count.differenceCents, -400)
  as(admin)
  const counts = (await ok(channels.sales.cashCounts, { from: today, to: today })).counts
  assert.equal(counts.length, 1)
  assert.equal((await report('cashCounts')).rows[0].result, 'Short')

  // Reconciliation: every batch's stock equals what came in less what went out, adjusted by
  // counts and voids.
  const batches = await db.selectFrom('batches').selectAll().execute()
  for (const batch of batches) {
    const out = await db
      .selectFrom('stockOuts')
      .select((eb) => eb.fn.coalesce(eb.fn.sum('quantity'), eb.lit(0)).as('total'))
      .where('batchId', '=', batch.id)
      .executeTakeFirstOrThrow()
    const adjusted = await db
      .selectFrom('stockAdjustments')
      .select((eb) => eb.fn.coalesce(eb.fn.sum('change'), eb.lit(0)).as('total'))
      .where('batchId', '=', batch.id)
      .executeTakeFirstOrThrow()
    const voidedPieces = await sql`SELECT COALESCE(SUM(i.quantity * i.pieces_per_unit), 0) AS total FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status = 'voided' AND i.batch_id = ${batch.id}`.execute(
      db
    )
    assert.equal(
      batch.currentStock,
      batch.initialStock -
        Number(out.total) +
        Number(adjusted.total) +
        Number(voidedPieces.rows[0].total),
      `batch ${batch.physicalTag}`
    )
  }
  assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
  console.log(
    'PASS: price list and pack sizes, locked order costs, receiving differences and rejections, batch box sizes in wholesale, FEFO, duplicate customers/clients and merge, archive instead of delete, voids with admin approval, controlled drugs register, write-off reasons and losses, supplier returns and credit notes, stock count up and down, cash count, audit details, reconciliation'
  )
  await db.destroy()
}
