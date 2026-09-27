/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.SYSTEM_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-system-test-'))
  let failures = 0
  try {
    const phases = [
      'migration-first',
      'runtime-first',
      'legacy',
      'workflow',
      'workflow-restart',
      'packaged'
    ]
    if (process.env.SYSTEM_TEST_SOURCE) {
      const { default: SQLite } = await import('better-sqlite3')
      const source = new SQLite(process.env.SYSTEM_TEST_SOURCE, {
        readonly: true,
        fileMustExist: true
      })
      try {
        await source.backup(join(directory, 'existing.db'))
      } finally {
        source.close()
      }
      phases.push('existing')
    }
    for (const phase of phases) {
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
            SYSTEM_TEST_PHASE: phase,
            DATABASE:
              phase === 'packaged'
                ? undefined
                : join(directory, `${phase === 'workflow-restart' ? 'workflow' : phase}.db`),
            INVENTORY_TEST_USER_DATA: directory,
            DOTENV_CONFIG_PATH: join(directory, 'no.env')
          }
        }
      )
      if (child.status !== 0) failures++
    }
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-system-test-'))
    await rm(directory, { recursive: true })
  }
  assert.equal(failures, 0, `${failures} system audit phases failed`)
} else {
  if (process.env.SYSTEM_TEST_PHASE === 'packaged') {
    const { default: SQLite } = await import('better-sqlite3')
    const legacyDirectory = join(process.env.INVENTORY_TEST_USER_DATA, 'legacy-install')
    await mkdir(legacyDirectory)
    process.chdir(legacyDirectory)
    const legacy = new SQLite('pddms.db')
    legacy.exec(
      "CREATE TABLE startup_probe (value TEXT NOT NULL); INSERT INTO startup_probe VALUES ('preserved')"
    )
    legacy.close()
  }
  const { db, database } = await import('../src/main/db.ts')
  const { initializeDatabase } = await import('../src/main/migrations.ts')
  const { Migrator } = await import('kysely/migration')
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.ts'))
    .sort()
  const migrations = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file.slice(0, -3), await import(`../migrations/${file}`)])
    )
  )
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } })
  const migrate = async () => {
    const result = await migrator.migrateToLatest()
    if (result.error) throw result.error
    assert.equal(
      result.results?.some((item) => item.status === 'Error'),
      false
    )
  }
  try {
    const phase = process.env.SYSTEM_TEST_PHASE
    if (phase === 'packaged') {
      assert.equal(resolve(database.name), join(process.env.INVENTORY_TEST_USER_DATA, 'pddms.db'))
      assert.equal(database.prepare('SELECT value FROM startup_probe').get().value, 'preserved')
      await initializeDatabase()
      const { default: SQLite } = await import('better-sqlite3')
      const legacy = new SQLite('pddms.db', { readonly: true })
      assert.equal(legacy.prepare('SELECT value FROM startup_probe').get().value, 'preserved')
      assert.equal(
        legacy.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'accounts'").get()
          .count,
        0
      )
      legacy.close()
    } else if (phase === 'existing') {
      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'kysely_%'"
        )
        .all()
      const counts = tables.map(({ name }) => ({
        name,
        count: database
          .prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`)
          .get().count
      }))
      await initializeDatabase()
      await initializeDatabase()
      await migrate()
      for (const { name, count } of counts)
        assert.equal(
          database.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get()
            .count,
          count,
          `${name}: existing rows preserved`
        )
      assert.equal(
        database
          .prepare(
            'SELECT COUNT(*) AS count FROM batches WHERE current_stock < 0 OR current_stock > initial_stock'
          )
          .get().count,
        0
      )
      console.log(`PASS: existing database copy, preserved row counts in ${counts.length} tables`)
    } else if (phase === 'workflow-restart') {
      await initializeDatabase()
      await import('../src/main/auth/controller.ts')
      await import('../src/main/purchase-order/controller.ts')
      const { handlers } = await import('./inventory-test-electron.mjs')
      const { channels } = await import('../src/shared/constants.ts')
      assert.equal(
        (
          await handlers.get(channels.auth.signIn)(
            {},
            { username: 'system-admin', password: 'DisposableTest123' }
          )
        ).success,
        true
      )
      const delivery = await db
        .selectFrom('supplierDeliveries')
        .selectAll()
        .executeTakeFirstOrThrow()
      const result = await handlers.get(channels.purchaseOrder.recordDeliveryById)(
        {},
        delivery.purchaseOrderId,
        { ...JSON.parse(delivery.requestFingerprint), requestId: delivery.requestId }
      )
      assert.equal(result.success, true, JSON.stringify(result))
      assert.equal((await db.selectFrom('supplierDeliveries').selectAll().execute()).length, 1)
      assert.equal((await db.selectFrom('batches').selectAll().execute())[0].currentStock, 4)
    } else if (phase === 'migration-first') {
      await migrate()
      await initializeDatabase()
      await migrate()
    } else if (phase === 'runtime-first') {
      await initializeDatabase()
      await migrate()
      await initializeDatabase()
    } else if (phase === 'legacy') {
      database.exec(`CREATE TABLE accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ); INSERT INTO accounts(role, username, password) VALUES ('manager', 'legacy-user', 'unused-test-hash');
      CREATE TABLE drugs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, generic_name TEXT NOT NULL,
        brand_name TEXT NOT NULL, formulation TEXT NOT NULL, is_prescribed INTEGER NOT NULL, is_controlled INTEGER NOT NULL
      ); INSERT INTO drugs(category, generic_name, brand_name, formulation, is_prescribed, is_controlled)
        VALUES ('Medicine', 'Legacy', 'Legacy', 'Tablet', 0, 0)`)
      for (const file of files.slice(2, 9)) await migrations[file.slice(0, -3)].up(db)
      const paymentSql = database
        .prepare("SELECT sql FROM sqlite_master WHERE name = 'supplier_payments'")
        .get().sql
      database.exec('DROP TABLE supplier_payments')
      database.exec(paymentSql.replace(/"invoice_id" integer/i, '"invoice_id" integer NOT NULL'))
      assert.equal(
        database
          .pragma('table_info(supplier_payments)')
          .find((column) => column.name === 'invoice_id').notnull,
        1
      )
      await migrate()
      await initializeDatabase()
      const legacy = await db.selectFrom('accounts').selectAll().executeTakeFirstOrThrow()
      assert.equal(legacy.role, 'staff')
      assert.equal(legacy.fullName, 'legacy-user')
      assert.equal(legacy.failedAttempts, 0)
      assert.equal(
        database
          .pragma('table_info(supplier_payments)')
          .find((column) => column.name === 'invoice_id').notnull,
        0
      )
      assert.equal((await db.selectFrom('drugs').selectAll().execute())[0].brandName, 'Legacy')
    } else {
      await initializeDatabase()
      const { handlers, renderer } = await import('./inventory-test-electron.mjs')
      const { channels } = await import('../src/shared/constants.ts')
      const { state } = await import('../src/main/api/index.ts')
      const { localDate } = await import('../src/shared/inventory.ts')
      const { generateReport } = await import('../src/main/reporting/repository.ts')
      const { supplierPaymentSchema } = await import('../src/shared/schemas.ts')
      for (const module of [
        'setup',
        'auth',
        'account',
        'customer',
        'supplier',
        'product',
        'purchase-order',
        'procurement',
        'dashboard'
      ])
        await import(`../src/main/${module}/controller.ts`)
      const invoke = (channel, ...args) => handlers.get(channel)({}, ...args)
      const ok = async (channel, ...args) => {
        const response = await invoke(channel, ...args)
        assert.equal(response.success, true, JSON.stringify(response))
        return response
      }
      const bad = async (channel, ...args) => {
        const response = await invoke(channel, ...args)
        assert.equal(response.success, false, JSON.stringify(response))
        return response
      }
      assert.equal((await ok(channels.setup.getStatus)).requiresSetup, true)
      await ok(channels.setup.createMaster, {
        fullName: 'System Admin',
        username: 'system-admin',
        password: 'DisposableTest123'
      })
      const actorId = state.session.account.id
      for (const event of [
        { sender: {}, senderFrame: {} },
        { sender: renderer, senderFrame: { url: renderer.mainFrame.url } }
      ]) {
        const response = await handlers.get(channels.auth.signOut)(event)
        assert.equal(response.success, false)
        assert.equal(state.session.account.id, actorId)
      }
      renderer.mainFrame.url = 'https://untrusted.invalid/'
      assert.equal((await invoke(channels.auth.getStatus)).success, false)
      renderer.mainFrame.url = 'file:///pddms-test/index.html#/suppliers'
      assert.equal((await ok(channels.auth.getStatus)).account.id, actorId)
      const dashboard = (await ok(channels.dashboard.getAdmin)).data
      assert.ok(dashboard.summaryMetrics.every((metric) => metric.value === 0))
      const supplier = (
        await ok(channels.supplier.createOne, {
          organization: 'System Supplier',
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
      ).supplier
      const product = (
        await ok(channels.product.createOne, {
          brandName: 'System Product',
          genericName: 'Generic',
          category: 'Medicine',
          formulation: 'Tablet',
          isPrescribed: false,
          isControlled: false,
          reorderLevel: 5
        })
      ).product
      const order = (
        await ok(channels.purchaseOrder.createOne, {
          supplierId: supplier.id,
          items: [{ drugId: product.id, quantity: 10, unitCost: 10.25 }]
        })
      ).order
      await ok(channels.purchaseOrder.updateStatusById, order.id, { status: 'submitted' })
      const expiry = new Date()
      expiry.setFullYear(expiry.getFullYear() + 1)
      const delivery = {
        requestId: randomUUID(),
        deliveredAt: localDate(),
        items: [
          {
            itemId: order.items[0].id,
            receivedQuantity: 4,
            batchNumber: 'SYSTEM-1',
            sellPrice: 15.25,
            expiresAt: localDate(expiry)
          }
        ]
      }
      await ok(channels.purchaseOrder.recordDeliveryById, order.id, delivery)
      await Promise.all([
        ok(channels.purchaseOrder.recordDeliveryById, order.id, delivery),
        ok(channels.purchaseOrder.recordDeliveryById, order.id, delivery)
      ])
      await bad(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery,
        notes: 'Changed request'
      })
      assert.equal((await db.selectFrom('supplierDeliveries').selectAll().execute()).length, 1)
      assert.equal((await db.selectFrom('batches').selectAll().execute())[0].currentStock, 4)
      await ok(channels.purchaseOrder.updateStatusById, order.id, { status: 'cancelled' })
      const records = (await ok(channels.procurement.getRecords)).paymentSummaries
      assert.equal(records.find((item) => item.purchaseOrderId === order.id)?.outstandingAmount, 41)
      const report = await generateReport({
        kind: 'financial',
        from: localDate(),
        to: localDate(),
        search: '',
        page: 1
      })
      assert.equal(
        report.metrics.find((metric) => metric.label === 'Current AP outstanding').value,
        4100
      )
      await ok(channels.purchaseOrder.recordDeliveryById, order.id, delivery)
      await bad(channels.purchaseOrder.recordDeliveryById, order.id, {
        ...delivery,
        requestId: randomUUID()
      })
      const payment = {
        purchaseOrderId: order.id,
        amount: 20.5,
        paidAt: localDate(),
        method: 'Cash',
        referenceNumber: 'SYSTEM-PAY'
      }
      await bad(channels.procurement.recordPayment, { ...payment, amount: 0.001 })
      await bad(channels.procurement.recordPayment, { ...payment, amount: 20.501 })
      assert.equal(supplierPaymentSchema.safeParse({ ...payment, amount: 0.29 }).success, true)
      await ok(channels.procurement.recordPayment, payment)
      await bad(channels.procurement.recordPayment, payment)
      await bad(channels.procurement.recordPayment, {
        ...payment,
        amount: 20.51,
        referenceNumber: 'SYSTEM-OVER'
      })
      await ok(channels.procurement.recordPayment, { ...payment, referenceNumber: 'SYSTEM-FINAL' })
      assert.equal(
        (await ok(channels.procurement.getRecords)).paymentSummaries[0].outstandingAmount,
        0
      )
      assert.equal((await db.selectFrom('batches').selectAll().execute())[0].currentStock, 4)
      const linked = await bad(channels.account.removeOneById, actorId)
      assert.doesNotMatch(linked.error, /SQLITE|constraint|select |insert /i)
      const { createBackup, validateBackup, restoreBackup } =
        await import('../src/main/backup/local.ts')
      const backup = await createBackup()
      await migrate()
      await validateBackup(backup.directory)
      await restoreBackup(backup.directory)
      assert.equal(
        (await migrator.getMigrations()).filter((migration) => migration.executedAt).length,
        files.length
      )
      assert.equal((await db.selectFrom('batches').selectAll().execute())[0].currentStock, 4)
      await ok(channels.auth.signOut)
      await bad(channels.dashboard.getAdmin)
      assert.equal((await ok(channels.auth.getStatus)).account, null)
    }
    assert.deepEqual(database.pragma('foreign_key_check'), [])
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok')
    console.log(`PASS: system audit ${phase}, foreign keys and integrity`)
  } finally {
    await db.destroy()
  }
}
