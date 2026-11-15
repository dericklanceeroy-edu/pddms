/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
/**
 * Verifies the rules added after the November 15 QA reports, end to end through the IPC handlers:
 * duplicate customers, products and suppliers; cashier limits on pharmacy clients; protected
 * customer records; pieces-per-box changes; last agreed supplier costs; purchase order cost and
 * date limits; invoice amount, size and file checks; payment references; sign-in and refused
 * permission audit entries; and backups when an invoice file is missing.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.QA_FIXES_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-qa-fixes-test-'))
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
          QA_FIXES_TEST_PHASE: 'workflow',
          DATABASE: join(directory, 'qa.db'),
          INVENTORY_TEST_USER_DATA: directory,
          INVENTORY_TEST_EXPORT: join(directory, 'export.txt')
        }
      }
    )
    assert.equal(child.status, 0, 'workflow failed')
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-qa-fixes-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate, yearsFromToday } = await import('../src/shared/inventory.ts')
  const { compactKey, productKey, phoneKey } = await import('../src/shared/duplicates.ts')
  const { handlers, dialog } = await import('./inventory-test-electron.mjs')
  const { validateBackup, invoiceDirectory } = await import('../src/main/backup/local.ts')
  const { hash } = await import('argon2')
  for (const module of [
    'auth',
    'administration',
    'customer',
    'supplier',
    'product',
    'purchase-order',
    'procurement',
    'sales'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
  const ok = async (channel, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, true, result.error)
    return result
  }
  const bad = async (channel, pattern, ...args) => {
    const result = await invoke(channel, ...args)
    assert.equal(result.success, false, JSON.stringify(result))
    if (pattern) assert.match(result.error ?? '', pattern)
    return result
  }
  const directory = process.env.INVENTORY_TEST_USER_DATA
  const choose = (path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }

  // Duplicate keys used by the checks below.
  assert.equal(compactKey(' Mercury Drug, Inc. '), compactKey('mercury drug inc'))
  assert.equal(productKey('500 mg Tablets'), productKey('500mg tablet'))
  assert.equal(productKey('Glass'), 'glass')
  assert.equal(phoneKey('+63 917 123 4567'), phoneKey('0917-123-4567'))

  const password = await hash('QaFixesTest123')
  const admin = await db
    .insertInto('accounts')
    .values({ role: 'master', username: 'qa-admin', fullName: 'QA Admin', password })
    .returningAll()
    .executeTakeFirstOrThrow()
  const cashier = await db
    .insertInto('accounts')
    .values({ role: 'cashier', username: 'qa-cashier', fullName: 'QA Cashier', password })
    .returningAll()
    .executeTakeFirstOrThrow()
  state.session = { account: admin }

  // D4: suppliers with the same organization name, ignoring case, spacing and punctuation.
  const supplierInput = {
    organization: 'Mercury Drug Supply, Inc.',
    person: 'Ana Reyes',
    phone: '09170000001',
    telephone: null,
    email: null,
    street: 'Street',
    city: 'City',
    province: 'Province',
    country: 'Philippines',
    postalCode: '1000'
  }
  const supplier = (await ok(channels.supplier.createOne, supplierInput)).supplier
  await bad(channels.supplier.createOne, /already saved as a supplier/, {
    ...supplierInput,
    organization: 'mercury  drug supply inc'
  })
  const other = (
    await ok(channels.supplier.createOne, { ...supplierInput, organization: 'Other Supplier' })
  ).supplier
  await bad(channels.supplier.updateOneById, /already saved as a supplier/, other.id, {
    organization: 'MERCURY DRUG SUPPLY INC.'
  })

  // D2: products with the same brand and formulation, ignoring spaces, case and plurals.
  const productInput = {
    brandName: 'QA Biogesic',
    genericName: 'Paracetamol',
    formulation: '500 mg Tablet',
    category: 'Analgesic',
    isPrescribed: false,
    isControlled: false,
    reorderLevel: 5,
    piecesPerBox: 10
  }
  const product = (await ok(channels.product.createOne, productInput)).product
  await bad(channels.product.createOne, /already exists/, {
    ...productInput,
    brandName: 'qa biogesic',
    formulation: '500mg Tablets'
  })
  const syrup = (
    await ok(channels.product.createOne, { ...productInput, formulation: '250 mg/5 mL Syrup' })
  ).product
  await bad(channels.product.updateOneById, /already exists/, syrup.id, {
    formulation: '500 MG TABLETS'
  })

  // L7 and L6: purchase order cost floor and expected-date limit.
  const orderInput = (unitCost, extra = {}) => ({
    supplierId: supplier.id,
    items: [{ drugId: product.id, quantity: 5, unitCost }],
    ...extra
  })
  await bad(channels.purchaseOrder.createOne, null, orderInput(0))
  await bad(channels.purchaseOrder.createOne, null, orderInput(0.001))
  await bad(
    channels.purchaseOrder.createOne,
    null,
    orderInput(100, { expectedAt: yearsFromToday(2) })
  )

  // F4: each order line remembers the supplier's agreed cost per box; editing a draft updates it.
  const draft = (await ok(channels.purchaseOrder.createOne, orderInput(100))).order
  const costOf = async () =>
    (await ok(channels.purchaseOrder.getSupplierCosts)).costs.find(
      (cost) => cost.supplierId === supplier.id && cost.drugId === product.id
    )?.unitCost
  assert.equal(await costOf(), 100)
  await ok(channels.purchaseOrder.updateOneById, draft.id, orderInput(110))
  assert.equal(await costOf(), 110)
  assert.equal(
    (await ok(channels.purchaseOrder.getSupplierCosts)).costs.filter(
      (cost) => cost.supplierId === supplier.id
    ).length,
    1
  )
  const order = (
    await ok(channels.purchaseOrder.updateStatusById, draft.id, { status: 'submitted' })
  ).order
  // The batch keeps the cost actually paid; the agreed cost is only a starting value.
  await ok(channels.purchaseOrder.recordDeliveryById, order.id, {
    requestId: randomUUID(),
    deliveredAt: localDate(),
    notes: null,
    deliveredByName: 'Supplier Driver',
    checkedByName: 'Receiving Clerk',
    items: [
      {
        itemId: order.items[0].id,
        receivedQuantity: 5,
        batchNumber: 'QA-1',
        sellPrice: 15,
        expiresAt: '2099-01-01'
      }
    ]
  })
  const batch = await db
    .selectFrom('batches')
    .selectAll()
    .where('drugId', '=', product.id)
    .executeTakeFirstOrThrow()
  assert.equal(batch.currentStock, 50)
  assert.equal(batch.buyPrice, 11)

  // L11: changing pieces per box while stock is on hand needs confirmation.
  await bad(channels.product.updateOneById, /Confirm the change/, product.id, { piecesPerBox: 12 })
  assert.equal(
    (await db.selectFrom('drugs').select('piecesPerBox').where('id', '=', product.id).executeTakeFirst())
      .piecesPerBox,
    10
  )
  await ok(channels.product.updateOneById, product.id, {
    piecesPerBox: 12,
    confirmPiecesChange: true
  })
  await ok(channels.product.updateOneById, product.id, {
    piecesPerBox: 10,
    confirmPiecesChange: true
  })
  // Products without stock change freely.
  await ok(channels.product.updateOneById, syrup.id, { piecesPerBox: 4 })

  // L3: invoices cannot total more than the order value (5 boxes x ₱110 = ₱550).
  const invoicePath = join(directory, 'invoice.pdf')
  await writeFile(invoicePath, '%PDF-1.4 supplier invoice')
  const upload = async (amount, invoiceNumber) => {
    choose(invoicePath)
    const chosen = (await ok(channels.procurement.chooseInvoiceFile)).file
    return invoke(channels.procurement.uploadInvoice, {
      fileToken: chosen.token,
      purchaseOrderId: order.id,
      invoiceNumber,
      invoiceDate: localDate(),
      dueDate: localDate(),
      amount
    })
  }
  const tooMuch = await upload(551, 'INV-TOO-MUCH')
  assert.equal(tooMuch.success, false)
  assert.match(tooMuch.error, /cannot exceed the order value of ₱550\.00/)
  const invoice = await upload(500, 'INV-QA-1')
  assert.equal(invoice.success, true, invoice.error)
  const second = await upload(60, 'INV-QA-2')
  assert.equal(second.success, false)
  assert.match(second.error, /₱500\.00 is already invoiced/)
  assert.equal((await upload(50, 'INV-QA-3')).success, true)

  // L5: invoice files must really be the type their extension says, and at most 20 MB.
  const fake = join(directory, 'renamed.pdf')
  await writeFile(fake, 'MZ not a pdf')
  choose(fake)
  await bad(channels.procurement.chooseInvoiceFile, /not a real PDF/)
  const fakeImage = join(directory, 'photo.png')
  await writeFile(fakeImage, '%PDF-1.4 renamed')
  choose(fakeImage)
  await bad(channels.procurement.chooseInvoiceFile, /not a real PNG/)
  const large = join(directory, 'large.pdf')
  await writeFile(large, Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(21 * 1024 * 1024)]))
  choose(large)
  await bad(channels.procurement.chooseInvoiceFile, /larger than 20 MB/)
  const png = join(directory, 'scan.png')
  await writeFile(
    png,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
  )
  choose(png)
  await ok(channels.procurement.chooseInvoiceFile)

  // L4: traceable payment methods need a reference number.
  const payment = (method, referenceNumber) => ({
    purchaseOrderId: order.id,
    invoiceId: invoice.invoice.id,
    amount: 10,
    paidAt: localDate(),
    method,
    referenceNumber,
    notes: null
  })
  for (const method of ['GCash', 'Maya', 'Bank transfer', 'Check'])
    await bad(channels.procurement.recordPayment, null, payment(method, null))
  await bad(channels.procurement.recordPayment, null, payment('GCash', '   '))
  await ok(channels.procurement.recordPayment, payment('GCash', 'GC-QA-0001'))
  await ok(channels.procurement.recordPayment, payment('Cash', null))

  // D1 and Q3: the same name and mobile number cannot be saved twice, as a customer or a pharmacy
  // client; different people may share one number.
  const customerInput = {
    fullName: 'Juan Dela Cruz',
    phone: '09171234567',
    email: null,
    address: null,
    discountType: 'none',
    discountId: null,
    discountExpiresAt: null,
    clientType: 'retail',
    contactPerson: null
  }
  const juan = (await ok(channels.customer.createOne, customerInput)).customer
  await bad(channels.customer.createOne, /already saved as a customer/, {
    ...customerInput,
    fullName: 'juan  dela cruz',
    phone: '+63 917 123 4567'
  })
  await bad(channels.customer.createOne, /already saved as a customer/, {
    ...customerInput,
    clientType: 'pharmacy',
    contactPerson: 'Juan'
  })
  const maria = (
    await ok(channels.customer.createOne, { ...customerInput, fullName: 'Maria Dela Cruz' })
  ).customer
  await bad(channels.customer.updateOneById, /already saved/, maria.id, {
    ...customerInput,
    fullName: 'JUAN DELA CRUZ'
  })
  const clinic = (
    await ok(channels.customer.createOne, {
      ...customerInput,
      fullName: 'St. Jude Pharmacy',
      phone: '09179998888',
      clientType: 'pharmacy',
      contactPerson: 'Ana Reyes'
    })
  ).customer
  await bad(channels.customer.createOne, /already saved as a pharmacy client/, {
    ...customerInput,
    fullName: 'St Jude Pharmacy',
    phone: '0917 999 8888',
    clientType: 'pharmacy',
    contactPerson: 'Ana Reyes'
  })

  // L6: discount ID expiry within 10 years.
  await bad(channels.customer.createOne, null, {
    ...customerInput,
    fullName: 'Pedro Penduko',
    discountType: 'pwd',
    discountId: 'PWD12345',
    discountExpiresAt: yearsFromToday(11)
  })

  // L10: customers with sales history are kept so their receipts stay complete.
  await ok(channels.sales.checkout, {
    requestId: randomUUID(),
    customerId: juan.id,
    items: [{ batchId: batch.id, quantity: 1, unitPriceCents: 1500 }],
    expectedTotalCents: 1500,
    cashCents: 2000
  })
  await bad(channels.customer.removeOneById, /Customers with sales history can't be removed/, juan.id)
  await ok(channels.customer.removeOneById, maria.id)

  // L18: cashiers see and edit retail customers only.
  state.session = { account: cashier }
  const visible = (await ok(channels.customer.getAll)).customers
  assert.ok(visible.some((customer) => customer.id === juan.id))
  assert.ok(visible.every((customer) => customer.clientType === 'retail'))
  await bad(channels.customer.createOne, /managed in Wholesale & Deliveries/, {
    ...customerInput,
    fullName: 'New Pharmacy',
    phone: '09175556666',
    clientType: 'pharmacy',
    contactPerson: 'Ana Reyes'
  })
  await bad(channels.customer.updateOneById, /managed in Wholesale & Deliveries/, clinic.id, {
    ...customerInput,
    fullName: 'St. Jude Pharmacy',
    phone: '09179998888',
    clientType: 'pharmacy',
    contactPerson: 'Someone Else'
  })
  await bad(channels.customer.updateOneById, /managed in Wholesale & Deliveries/, juan.id, {
    ...customerInput,
    clientType: 'pharmacy',
    contactPerson: 'Juan'
  })
  await ok(channels.customer.createOne, {
    ...customerInput,
    fullName: 'Retail Walk In',
    phone: '09175556667'
  })

  // L13: a refused permission check is logged as "denied", including refused views.
  await bad(channels.administration.logs, null, { search: '' })
  const deniedView = await db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', channels.administration.logs)
    .executeTakeFirst()
  assert.equal(deniedView?.result, 'denied')
  assert.equal(deniedView?.actorId, cashier.id)

  // L13: a sign-in attempt is logged under the typed username, never the previous session.
  state.session = { account: admin }
  await bad(channels.auth.signIn, null, { username: 'qa-cashier', password: 'WrongPassword1' })
  const attempt = await db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', channels.auth.signIn)
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow()
  assert.equal(attempt.actorId, null)
  assert.equal(attempt.actorName, 'qa-cashier')
  assert.equal(attempt.result, 'failed')
  await ok(channels.auth.signIn, { username: 'qa-admin', password: 'QaFixesTest123' })
  const signedIn = await db
    .selectFrom('auditLogs')
    .selectAll()
    .where('action', '=', channels.auth.signIn)
    .orderBy('id', 'desc')
    .executeTakeFirstOrThrow()
  assert.equal(signedIn.actorId, admin.id)
  assert.equal(signedIn.result, 'success')

  // M1: a backup still completes when an invoice file is missing, and names it.
  const stored = await db
    .selectFrom('supplierInvoices')
    .select('storedFilename')
    .where('invoiceNumber', '=', 'INV-QA-3')
    .executeTakeFirstOrThrow()
  await unlink(join(invoiceDirectory(), stored.storedFilename))
  const destination = join(directory, 'backups-chosen')
  await mkdir(destination)
  choose(destination)
  const backup = (await ok(channels.administration.backup)).backup
  assert.equal(backup.invoiceCount, 1)
  assert.equal(backup.missingInvoices.length, 1)
  assert.match(backup.missingInvoices[0], /INV-QA-3/)
  assert.equal((await validateBackup(backup.directory)).invoiceCount, 1)

  console.log(
    'PASS: duplicate customers/products/suppliers, cashier customer limits, protected customers, pieces-per-box confirmation, agreed supplier costs, PO cost/date limits, invoice cap/size/type, payment references, audit actors and denied views, backup with a missing invoice'
  )
}
