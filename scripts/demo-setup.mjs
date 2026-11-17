/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node tooling uses JavaScript. */
/**
 * Development-only demo database.
 *
 *   npm run demo:setup   Build a separate demo database (default ./pddms-demo.db) with demo
 *                        accounts and sample pharmacy records.
 *   npm run demo:dev     Same, then start the app in development mode on that database.
 *
 * Safety rules:
 * - Never runs when NODE_ENV=production; scripts/ is also excluded from packaged builds.
 * - Never writes into a database that already holds records. An existing demo database is left
 *   unchanged, so running it again is safe and creates no duplicates.
 * - Records are built in a temporary file through the app's own IPC handlers (same validation,
 *   password hashing, stock and payment rules) and only moved into place when every step passed.
 * - The normal database (./pddms.db or DATABASE in .env) is never used, so normal installs keep the
 *   first-launch Master Account setup.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const handoff = (orderId) => ({
  orderId,
  driverName: 'Demo Driver',
  receivedByName: 'Demo Receiving Pharmacist'
})

export const demoAccounts = [
  {
    role: 'master',
    fullName: 'Demo Admin',
    email: 'demo.admin@example.com',
    phone: '09170000301',
    username: 'demo.admin',
    password: 'DemoAdmin#2026'
  },
  {
    role: 'staff',
    fullName: 'Demo Staff',
    email: 'demo.staff@example.com',
    phone: '09170000302',
    username: 'demo.staff',
    password: 'DemoStaff#2026'
  },
  {
    role: 'cashier',
    fullName: 'Demo Cashier',
    email: 'demo.cashier@example.com',
    phone: '09170000303',
    username: 'demo.cashier',
    password: 'DemoCashier#2026'
  }
]

const root = fileURLToPath(new URL('../', import.meta.url))

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

/** Electron's userData folder for this app ("pddms"), where supplier invoice files are stored. */
function defaultUserData() {
  if (process.platform === 'win32')
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'pddms')
  if (process.platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'pddms')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'pddms')
}

/** Returns the number of rows across all app tables, or 0 when the file does not exist. */
async function countRecords(path) {
  if (!existsSync(path)) return { rows: 0, demo: false }
  const { default: SQLite } = await import('better-sqlite3')
  const database = new SQLite(path, { readonly: true, fileMustExist: true })
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'kysely_%'"
      )
      .all()
    let rows = 0
    for (const { name } of tables)
      rows += database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count
    const demo =
      tables.some(({ name }) => name === 'accounts') &&
      !!database.prepare('SELECT 1 FROM accounts WHERE username = ?').get('demo.admin')
    return { rows, demo }
  } finally {
    database.close()
  }
}

async function setup(target, userData) {
  const existing = await countRecords(target)
  if (existing.demo) {
    console.log(`Demo database already set up at ${target}. Nothing was changed.`)
    return
  }
  if (existing.rows > 0) {
    console.error(
      `Refusing to seed ${target}: it already contains ${existing.rows} record(s) that are not demo data.\n` +
        'Choose another file with --database <path>. Existing data is never overwritten.'
    )
    process.exit(1)
  }
  const directory = await mkdtemp(join(tmpdir(), 'pddms-demo-'))
  try {
    const invoicePath = join(directory, 'demo-supplier-invoice.pdf')
    await writeFile(
      invoicePath,
      '%PDF-1.4\n% Med Prix demo supplier invoice. Fictional document for development only.\n%%EOF\n'
    )
    const building = join(directory, 'demo.db')
    const child = spawnSync(
      process.execPath,
      [
        '--experimental-loader',
        new URL('./inventory-test-loader.mjs', import.meta.url).href,
        fileURLToPath(import.meta.url),
        '--seed'
      ],
      {
        stdio: 'inherit',
        cwd: root,
        env: {
          ...process.env,
          DATABASE: building,
          DATABASE_BACKUP: join(directory, 'backup.db'),
          DEMO_SEED_PHASE: '1',
          INVENTORY_TEST_INVOICE: invoicePath,
          INVENTORY_TEST_USER_DATA: userData
        }
      }
    )
    if (child.status !== 0) {
      console.error('Demo setup failed. No database was written.')
      process.exit(1)
    }
    // Note: Re-check right before moving, in case the target was used while the demo was built.
    if ((await countRecords(target)).rows > 0) {
      console.error(`Refusing to replace ${target}: records were added to it during setup.`)
      process.exit(1)
    }
    await rename(building, target).catch(async (error) => {
      if (error.code !== 'EXDEV') throw error
      const { copyFile } = await import('node:fs/promises')
      await copyFile(building, target)
    })
    console.log(`Demo database ready: ${target}`)
    console.log('Demo sign-ins (development only):')
    for (const account of demoAccounts)
      console.log(`  ${account.role.padEnd(8)} ${account.username.padEnd(14)} ${account.password}`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function seed() {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { unitSellPrice, wholesaleBoxPrice } = await import('../src/shared/units.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  for (const module of [
    'setup',
    'auth',
    'account',
    'supplier',
    'product',
    'customer',
    'price-list',
    'purchase-order',
    'procurement',
    'sales',
    'wholesale'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()

  const call = async (channel, ...args) => {
    const result = await handlers.get(channel)({}, ...args)
    assert.equal(result?.success ?? true, true, `${channel}: ${result?.error}`)
    return result
  }
  const day = (offset) => {
    const value = new Date()
    value.setDate(value.getDate() + offset)
    return localDate(value)
  }
  const signIn = (account) =>
    call(channels.auth.signIn, { username: account.username, password: account.password })
  const [admin, staff, cashier] = demoAccounts

  try {
    // Accounts: the Master Account goes through first-launch setup, the others through user management.
    await call(channels.setup.createMaster, {
      fullName: admin.fullName,
      email: admin.email,
      phone: admin.phone,
      username: admin.username,
      password: admin.password
    })
    for (const account of [
      staff,
      cashier,
      {
        role: 'staff',
        fullName: 'Demo Blocked User',
        email: 'demo.blocked@example.com',
        phone: '09170000304',
        username: 'demo.blocked',
        password: randomUUID()
      }
    ])
      await call(channels.account.createOne, account)
    const blocked = await db
      .selectFrom('accounts')
      .select('id')
      .where('username', '=', 'demo.blocked')
      .executeTakeFirstOrThrow()
    await call(channels.account.setBlockedById, blocked.id, true)

    // Suppliers and products (all fictional).
    const suppliers = []
    for (const supplier of [
      [
        'Southpoint Pharma Distributors (Demo)',
        'Maria Santos',
        '09170000101',
        'General Santos City'
      ],
      ['Bayview Medical Supply (Demo)', 'Jose Reyes', '09170000102', 'Davao City'],
      ['Northfield Generics Trading (Demo)', 'Ana Cruz', '09170000103', 'Koronadal City']
    ])
      suppliers.push(
        (
          await call(channels.supplier.createOne, {
            organization: supplier[0],
            person: supplier[1],
            phone: supplier[2],
            telephone: null,
            email: `${supplier[1].split(' ')[0].toLowerCase()}@example.com`,
            street: '123 Demo Street',
            city: supplier[3],
            province: 'South Cotabato',
            country: 'Philippines',
            postalCode: '9500'
          })
        ).supplier
      )
    const products = {}
    for (const [key, brandName, genericName, formulation, category, isPrescribed, reorderLevel] of [
      ['paracetamol', 'Feverex', 'Paracetamol', '500 mg Tablet', 'Analgesic', false, 50],
      ['amoxicillin', 'Amoxidem', 'Amoxicillin', '500 mg Capsule', 'Antibiotic', true, 30],
      ['cetirizine', 'Allerin', 'Cetirizine', '10 mg Tablet', 'Antihistamine', false, 20],
      ['losartan', 'Losardem', 'Losartan Potassium', '50 mg Tablet', 'Antihypertensive', true, 30],
      ['metformin', 'Glucodem', 'Metformin', '500 mg Tablet', 'Antidiabetic', true, 40],
      ['ascorbic', 'Vitacee', 'Ascorbic Acid', '500 mg Tablet', 'Vitamin', false, 30],
      ['salbutamol', 'Breathex', 'Salbutamol', '2 mg/5 mL Syrup', 'Bronchodilator', true, 10],
      ['omeprazole', 'Gastrodem', 'Omeprazole', '20 mg Capsule', 'Antacid', false, 20]
    ])
      products[key] = (
        await call(channels.product.createOne, {
          brandName,
          genericName,
          formulation,
          category,
          isPrescribed,
          isControlled: false,
          reorderLevel
        })
      ).product

    // Supplier price list, set by the owner from each supplier's quotation: [product, pieces per
    // box, cost per box]. Box sizes differ by product (and cetirizine by supplier) so packs, box
    // sales and per-batch box sizes show in the demo. Salbutamol syrup is sold by the bottle.
    const packs = {}
    for (const [supplierIndex, keys] of [
      [0, [['paracetamol', 100, 120], ['cetirizine', 10, 25], ['ascorbic', 60, 90]]],
      [
        1,
        [
          ['amoxicillin', 50, 200],
          ['losartan', 100, 300],
          ['metformin', 30, 54],
          ['cetirizine', 20, 50]
        ]
      ],
      [2, [['salbutamol', 1, 35], ['omeprazole', 20, 70]]]
    ])
      for (const [key, piecesPerBox, unitCost] of keys)
        packs[`${supplierIndex}:${key}`] = (
          await call(channels.priceList.createPack, {
            supplierId: suppliers[supplierIndex].id,
            drugId: products[key].id,
            piecesPerBox,
            unitCost,
            effectiveFrom: day(-210),
            quotationReference: `DEMO-QUOTE-${supplierIndex + 1}`
          })
        ).data

    // Purchasing and receiving, done by the staff account.
    await call(channels.auth.signOut)
    await signIn(staff)
    const createOrder = async (supplier, lines, expectedAt = null, notes = null) =>
      (
        await call(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          expectedAt,
          notes,
          items: lines.map(([key, quantity]) => ({
            packId: packs[`${suppliers.indexOf(supplier)}:${key}`],
            quantity
          }))
        })
      ).order
    const submit = (order) =>
      call(channels.purchaseOrder.updateStatusById, order.id, { status: 'submitted' })
    const receive = (order, deliveredAt, lines) =>
      call(channels.purchaseOrder.recordDeliveryById, order.id, {
        requestId: randomUUID(),
        deliveredAt,
        deliveredByName: 'Demo Courier',
        checkedByName: 'Demo Receiving Clerk',
        notes: null,
        items: lines.map(([key, receivedQuantity, batchNumber, sellPrice, expiresAt]) => ({
          itemId: order.items.find((item) => item.drugId === products[key].id).id,
          receivedQuantity,
          batchNumber,
          sellPrice,
          expiresAt
        }))
      })
    /** Older orders are dated in the past so order, delivery and expiry dates stay in sequence. */
    const backdate = (order, offset) =>
      db
        .updateTable('purchaseOrders')
        .set({
          orderNumber: order.orderNumber.replace(
            /^PO-\d{8}/,
            `PO-${day(offset).replaceAll('-', '')}`
          ),
          orderedAt: `${day(offset)} 09:00:00`,
          createdAt: `${day(offset)} 09:00:00`,
          expectedAt: day(offset + 5)
        })
        .where('id', '=', order.id)
        .execute()
    const uploadInvoice = async (order, invoiceNumber, invoiceDate, dueDate, amount) => {
      const { file } = await call(channels.procurement.chooseInvoiceFile)
      return (
        await call(channels.procurement.uploadInvoice, {
          fileToken: file.token,
          purchaseOrderId: order.id,
          invoiceNumber,
          invoiceDate,
          dueDate,
          amount
        })
      ).invoice
    }
    const pay = (order, invoice, amount, paidAt, referenceNumber) =>
      call(channels.procurement.recordPayment, {
        purchaseOrderId: order.id,
        invoiceId: invoice.id,
        amount,
        paidAt,
        method: 'Bank transfer',
        referenceNumber,
        notes: null
      })

    // 1. Older, fully received and fully paid order: normal, near-expiry and expired batches.
    // Quantities are boxes: 3 × 100 Feverex, 4 × 10 Allerin, 2 × 60 Vitacee.
    const older = await createOrder(suppliers[0], [
      ['paracetamol', 3],
      ['cetirizine', 4],
      ['ascorbic', 2]
    ])
    await submit(older)
    await backdate(older, -200)
    await receive(older, day(-195), [
      ['paracetamol', 3, 'FVX-2401', 2.5, day(420)],
      ['cetirizine', 4, 'ALR-2311', 5, day(-12)],
      ['ascorbic', 2, 'VTC-2402', 3, day(45)]
    ])
    const olderInvoice = await uploadInvoice(older, 'SPD-INV-1001', day(-195), day(-165), 640)
    await pay(older, olderInvoice, 640, day(-170), 'BT-DEMO-1001')

    // 2. Recent order, received, invoice partly paid with the balance due soon.
    // Boxes: 3 × 50 Amoxidem, 2 × 100 Losardem, 1 × 30 Glucodem.
    const recent = await createOrder(suppliers[1], [
      ['amoxicillin', 3],
      ['losartan', 2],
      ['metformin', 1]
    ])
    await submit(recent)
    await backdate(recent, -25)
    await receive(recent, day(-20), [
      ['amoxicillin', 3, 'AMX-2409', 8, day(540)],
      ['losartan', 2, 'LSD-2408', 6.5, day(600)],
      ['metformin', 1, 'GLD-2409', 4, day(480)]
    ])
    const recentInvoice = await uploadInvoice(recent, 'BMS-INV-2045', day(-20), day(5), 1254)
    await pay(recent, recentInvoice, 600, day(-10), 'BT-DEMO-2045')

    // 3. Submitted order with one partial delivery, still awaiting the rest.
    const partial = await createOrder(
      suppliers[2],
      [
        ['salbutamol', 50],
        ['omeprazole', 4]
      ],
      day(7),
      'Deliver to the back entrance.'
    )
    await submit(partial)
    await receive(partial, day(0), [['salbutamol', 20, 'BRX-2410', 65, day(365)]])

    // 4. Draft order still being prepared.
    await createOrder(suppliers[0], [['paracetamol', 2]], day(10), 'Monthly restock')

    // 5. Cancelled order.
    const cancelled = await createOrder(suppliers[1], [['cetirizine', 3]])
    await submit(cancelled)
    await call(channels.purchaseOrder.updateStatusById, cancelled.id, { status: 'cancelled' })

    // Customers (fictional contact details).
    const customers = {}
    // Retail customers buy at the counter; the pharmacy client is the wholesale buyer.
    for (const [key, fullName, phone, discountType, discountId, clientType] of [
      ['walkIn', 'Liza Mendoza', '09170000201', 'none', null, 'retail'],
      ['senior', 'Ramon Villanueva', '09170000202', 'senior', 'SCDEMO0001', 'retail'],
      ['pwd', 'Carla Bautista', '09170000203', 'pwd', 'PWDDEMO0001', 'retail'],
      ['clinic', 'Sunrise Community Pharmacy', '09170000204', 'none', null, 'pharmacy']
    ])
      customers[key] = (
        await call(channels.customer.createOne, {
          clientType,
          contactPerson: clientType === 'pharmacy' ? 'Grace Lim' : null,
          fullName,
          phone,
          email: `${key.toLowerCase()}@example.com`,
          address: 'Demo Avenue, General Santos City',
          discountType,
          discountId,
          discountExpiresAt: discountId ? day(730) : null
        })
      ).customer

    const batches = Object.fromEntries(
      (
        await db
          .selectFrom('batches')
          .select(['id', 'physicalTag', 'sellPrice', 'boxSellPrice', 'wholesaleBoxPrice', 'piecesPerBox'])
          .execute()
      ).map((batch) => [batch.physicalTag, batch])
    )
    const line = (tag, quantity) => ({
      batchId: batches[tag].id,
      quantity,
      unit: 'piece',
      unitPriceCents: Math.round(batches[tag].sellPrice * 100)
    })
    /** Whole boxes, for wholesale orders and box sales at the counter. */
    const boxLine = (tag, quantity, wholesale = false) => {
      const batch = batches[tag]
      const price = wholesale
        ? wholesaleBoxPrice(batch.sellPrice, batch.boxSellPrice, batch.wholesaleBoxPrice, batch.piecesPerBox)
        : unitSellPrice('box', batch.sellPrice, batch.boxSellPrice, batch.piecesPerBox)
      return { batchId: batch.id, quantity, unit: 'box', unitPriceCents: Math.round(price * 100) }
    }

    // Wholesale: one delivered order with a partial payment, one scheduled order (staff).
    const wholesale = async (items, dueDate, scheduledDate, notes) =>
      call(channels.wholesale.create, {
        requestId: randomUUID(),
        customerId: customers.clinic.id,
        dueDate,
        scheduledDate,
        deliveryAddress: 'Sunrise Community Pharmacy, Demo Avenue, General Santos City',
        deliveryNotes: 'Receive at the pharmacy counter',
        notes,
        items
      })
    const { data: deliveredOrderId } = await wholesale(
      [boxLine('FVX-2401', 1, true), boxLine('AMX-2409', 1, true)],
      day(20),
      day(0),
      'Pharmacy monthly supply'
    )
    await call(channels.wholesale.deliver, handoff(deliveredOrderId))
    await wholesale([boxLine('LSD-2408', 1, true)], day(30), day(3), 'Scheduled for delivery')

    // Retail sales by the cashier, including Senior Citizen and PWD discounts.
    await call(channels.auth.signOut)
    await signIn(cashier)
    // Prescription (Rx) medicines need the prescribing doctor's details at checkout.
    const rx = (prescriptionNumber) => ({
      prescriberName: 'Dr. Demo Prescriber',
      prescriberLicense: 'PRC-0000000',
      prescriptionNumber,
      // Note: Demo-only register details for controlled medicines (separate demo database).
      patientName: 'Demo Patient',
      patientAge: 40,
      patientAddress: 'Demo address, Quezon City',
      prescriberAddress: 'Demo clinic, Quezon City',
      prescriberS2License: 'S2-DEMO-0000'
    })
    const sell = async (customerId, items, prescription = null) => {
      const { totals } = await call(channels.sales.quote, { customerId, items })
      return call(channels.sales.checkout, {
        requestId: randomUUID(),
        customerId,
        items,
        expectedTotalCents: totals.totalCents,
        cashCents: Math.ceil(totals.totalCents / 10000) * 10000,
        prescription
      })
    }
    await sell(null, [line('FVX-2401', 10), line('VTC-2402', 5)])
    await sell(customers.senior.id, [line('LSD-2408', 30), line('GLD-2409', 14)], rx('RX-DEMO-0001'))
    await sell(customers.pwd.id, [line('AMX-2409', 21)], rx('RX-DEMO-0002'))
    await sell(customers.walkIn.id, [line('BRX-2410', 1)], rx(''))
    await sell(null, [boxLine('VTC-2402', 1)])

    // Note: Demo-only sales history so trends and earlier periods in Reports are not empty. Each
    // sale goes through checkout like any other and is then dated back, with its stock movement,
    // in this separate demo database only.
    const backdateSale = async (sale, offset, hour) => {
      const at = new Date()
      at.setDate(at.getDate() + offset)
      at.setHours(hour, 15, 0, 0)
      const iso = at.toISOString()
      await db.updateTable('sales').set({ createdAt: iso }).where('id', '=', sale.id).execute()
      await db
        .updateTable('stockOuts')
        .set({ createdAt: iso.slice(0, 19).replace('T', ' ') })
        .where('reason', '=', `Sale ${sale.reference}`)
        .execute()
    }
    for (const [offset, hour, customerId, items, rxNumber] of [
      [-40, 10, null, [line('FVX-2401', 8), line('VTC-2402', 4)], null],
      [-38, 15, customers.senior.id, [line('LSD-2408', 30)], 'RX-DEMO-0101'],
      [-33, 11, null, [line('FVX-2401', 6)], null],
      [-6, 9, null, [line('FVX-2401', 12)], null],
      [-5, 14, customers.pwd.id, [line('AMX-2409', 14)], 'RX-DEMO-0102'],
      [-4, 10, null, [line('VTC-2402', 6), line('FVX-2401', 4)], null],
      [-3, 16, customers.senior.id, [line('GLD-2409', 10)], 'RX-DEMO-0103'],
      [-2, 11, null, [line('FVX-2401', 10)], null],
      [-1, 13, customers.walkIn.id, [line('VTC-2402', 3)], null]
    ]) {
      const { sale } = await sell(customerId, items, rxNumber ? rx(rxNumber) : null)
      await backdateSale(sale, offset, hour)
    }

    // Receivable payments are recorded by the Admin (staff cannot view balances).
    await call(channels.auth.signOut)
    await signIn(admin)
    await call(channels.wholesale.pay, {
      orderId: deliveredOrderId,
      amountCents: 15000,
      reference: 'WS-DEMO-0001',
      paidAt: day(0),
      method: 'Cash',
      notes: 'First installment'
    })
    await call(channels.auth.signOut)

    const count = async (table) =>
      Number(
        (
          await db
            .selectFrom(table)
            .select(({ fn }) => fn.countAll().as('count'))
            .executeTakeFirstOrThrow()
        ).count
      )
    console.log(
      `Seeded ${await count('accounts')} accounts, ${await count('suppliers')} suppliers, ` +
        `${await count('drugs')} products, ${await count('batches')} batches, ` +
        `${await count('purchaseOrders')} purchase orders, ${await count('supplierInvoices')} invoices, ` +
        `${await count('customers')} customers, ${await count('sales')} sales, ` +
        `${await count('wholesaleOrders')} wholesale orders.`
    )
  } finally {
    await db.destroy()
  }
}

// Note: Only act when run directly; verify-roles.mjs imports demoAccounts from this file.
const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint && process.env.NODE_ENV === 'production') {
  console.error('Demo setup is for development only and does not run when NODE_ENV=production.')
  process.exit(1)
}

if (isEntryPoint && process.env.DEMO_SEED_PHASE) {
  await seed()
} else if (isEntryPoint) {
  const command = process.argv[2] === 'dev' ? 'dev' : 'setup'
  const target = resolve(root, option('database', 'pddms-demo.db'))
  await setup(target, resolve(option('user-data', defaultUserData())))
  if (command === 'dev') {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./run-electron-vite.mjs', import.meta.url)), 'dev'],
      {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE: target,
          DATABASE_BACKUP: join(dirname(target), 'pddms-demo-backup.db')
        }
      }
    )
    child.on('exit', (code) => process.exit(code ?? 1))
  }
}
