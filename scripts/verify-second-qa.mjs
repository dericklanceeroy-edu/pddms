/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
/**
 * Verifies the fixes from the second November 15 QA pass end to end through the IPC handlers:
 * stock counts during sales (M1), same-day voids (M2), voids where the customer kept the
 * medicine (M3), re-ringing a voided e-wallet reference (M4), who may remove the Rx and controlled
 * flags (M5), cash count notes and recounts (L1, L2), void approval case and lock (L3, L4),
 * rejected boxes (L5), the Expired write-off reason (L6), credit note case (L7), the register date
 * range (L8), purchase order status in the log (L9), one fill per S2 prescription (L10) and the
 * reason a used account cannot be deleted (L11). It also runs the upgrade twice on one database.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.env.SECOND_QA_TEST_PHASE) {
  const directory = await mkdtemp(join(tmpdir(), 'pddms-second-qa-test-'))
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
          SECOND_QA_TEST_PHASE: 'workflow',
          DATABASE: join(directory, 'second-qa.db'),
          INVENTORY_TEST_USER_DATA: directory
        }
      }
    )
    assert.equal(child.status, 0, 'workflow failed')
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(directory.includes('pddms-second-qa-test-'))
    await rm(directory, { recursive: true })
  }
} else {
  const { db } = await import('../src/main/db.ts')
  const { initializeDatabase, migrate } = await import('../src/main/migrations.ts')
  const { state } = await import('../src/main/api/index.ts')
  const { channels } = await import('../src/shared/constants.ts')
  const { localDate } = await import('../src/shared/inventory.ts')
  const { handlers } = await import('./inventory-test-electron.mjs')
  const { sql } = await import('kysely')
  const { hash } = await import('argon2')
  for (const module of [
    'auth',
    'account',
    'administration',
    'customer',
    'supplier',
    'product',
    'price-list',
    'purchase-order',
    'procurement',
    'sales',
    'inventory',
    'supplier-return',
    'reporting'
  ])
    await import(`../src/main/${module}/controller.ts`)
  await initializeDatabase()
  // The upgrade only adds what is missing, so running it again changes nothing.
  await migrate(db)
  const index =
    await sql`SELECT sql FROM sqlite_master WHERE name = 'sales_payment_reference'`.execute(db)
  assert.match(index.rows[0].sql, /status = 'completed'/)

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

  const password = await hash('SecondQaTest123')
  const account = (role, username, fullName) =>
    db
      .insertInto('accounts')
      .values({ role, username, fullName, password })
      .returningAll()
      .executeTakeFirstOrThrow()
  const admin = await account('master', 'qa-admin', 'QA Admin')
  const staff = await account('staff', 'qa-staff', 'QA Staff')
  const cashier = await account('cashier', 'qa-cashier', 'QA Cashier')
  const unused = await account('cashier', 'qa-unused', 'QA Unused')
  const as = (who) => {
    state.session = { account: who }
  }
  as(admin)

  const supplier = (
    await ok(channels.supplier.createOne, {
      organization: 'QA Supplier',
      person: 'Ana Reyes',
      phone: '09170000001',
      telephone: null,
      email: null,
      street: 'Street',
      city: 'City',
      province: 'Province',
      country: 'Philippines',
      postalCode: '1000',
      pdeaLicense: 'PDEA-S3-0002'
    })
  ).supplier
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
  const tablet = await product('QA Tablet')
  const antibiotic = await product('QA Amoxicillin', { isPrescribed: true })
  const controlled = await product('QA Diazepam', {
    formulation: '5 mg Tablet',
    isPrescribed: true,
    isControlled: true
  })
  const pack = async (drugId, piecesPerBox, unitCost) =>
    (
      await ok(channels.priceList.createPack, {
        supplierId: supplier.id,
        drugId,
        piecesPerBox,
        unitCost,
        effectiveFrom: today,
        quotationReference: 'Q-QA'
      })
    ).data
  const tabletPack = await pack(tablet.id, 100, 500)
  const antibioticPack = await pack(antibiotic.id, 10, 50)
  const controlledPack = await pack(controlled.id, 10, 100)
  const draft = (
    await ok(channels.purchaseOrder.createOne, {
      supplierId: supplier.id,
      items: [
        { packId: tabletPack, quantity: 2 },
        { packId: antibioticPack, quantity: 2 },
        { packId: controlledPack, quantity: 2 }
      ]
    })
  ).order

  // L9: status changes record the old and new status in the activity log.
  const order = (
    await ok(channels.purchaseOrder.updateStatusById, draft.id, { status: 'submitted' })
  ).order
  const statusAudit = await lastAudit(channels.purchaseOrder.updateStatusById)
  assert.match(statusAudit.details, /Draft/)
  assert.match(statusAudit.details, /Submitted/)

  // L5: received and rejected together cannot exceed the boxes still open on the line.
  const line = (packId) => order.items.find((item) => item.packId === packId)
  const delivery = (items) => ({
    requestId: randomUUID(),
    deliveredAt: today,
    notes: null,
    deliveredByName: 'Driver',
    checkedByName: 'Clerk',
    items
  })
  const tabletLine = {
    itemId: line(tabletPack).id,
    receivedQuantity: 2,
    batchNumber: 'QA-TAB',
    sellPrice: 10,
    expiresAt: addDays(400)
  }
  await bad(
    channels.purchaseOrder.recordDeliveryById,
    /cannot exceed/,
    order.id,
    delivery([{ ...tabletLine, rejectedQuantity: 1, rejectionReason: 'Crushed box' }])
  )
  await ok(
    channels.purchaseOrder.recordDeliveryById,
    order.id,
    delivery([
      tabletLine,
      {
        itemId: line(antibioticPack).id,
        receivedQuantity: 2,
        batchNumber: 'QA-AMX',
        sellPrice: 8,
        expiresAt: addDays(300)
      },
      {
        itemId: line(controlledPack).id,
        receivedQuantity: 2,
        batchNumber: 'QA-DZP',
        sellPrice: 15,
        expiresAt: addDays(300)
      }
    ])
  )
  const tabletBatch = await batchByTag('QA-TAB')
  const controlledBatch = await batchByTag('QA-DZP')
  assert.equal(tabletBatch.currentStock, 200)

  // M5: staff cannot remove the Rx or controlled flag; they may add one. The administrator may
  // remove it.
  as(staff)
  await bad(channels.product.updateOneById, /Only the administrator/, antibiotic.id, {
    isPrescribed: false
  })
  await bad(channels.product.updateOneById, /Only the administrator/, controlled.id, {
    isControlled: false
  })
  await ok(channels.product.updateOneById, tablet.id, { isPrescribed: true })
  as(admin)
  await ok(channels.product.updateOneById, tablet.id, { isPrescribed: false })
  const flags = await db
    .selectFrom('drugs')
    .select(['id', 'isPrescribed', 'isControlled'])
    .where('id', 'in', [antibiotic.id, controlled.id, tablet.id])
    .orderBy('id')
    .execute()
  assert.deepEqual(
    flags.map((row) => [row.isPrescribed, row.isControlled]),
    [
      [0, 0],
      [1, 0],
      [1, 1]
    ]
  )

  const piece = (batch, quantity, price) => ({
    batchId: batch.id,
    quantity,
    unit: 'piece',
    unitPriceCents: price
  })
  const sell = async (items, totalCents, fields = {}) =>
    (
      await ok(channels.sales.checkout, {
        requestId: randomUUID(),
        customerId: null,
        items,
        expectedTotalCents: totalCents,
        cashCents: totalCents,
        ...fields
      })
    ).sale

  // M1: a sale made after the shelf is counted is not subtracted twice.
  as(admin)
  const countId = (await ok(channels.inventory.startCount, { drugId: tablet.id, notes: '' })).data
  as(cashier)
  await sell([piece(tabletBatch, 5, 1000)], 5000)
  assert.equal(await stock(tabletBatch.id), 195)
  as(admin)
  // The shelf is counted after the sale: 195 on the shelf, matching the system now.
  await ok(channels.inventory.recordCountLines, {
    countId,
    lines: [{ batchId: tabletBatch.id, counted: 195, reason: '' }]
  })
  let sheet = (await ok(channels.inventory.getCount, countId)).count
  assert.equal(sheet.lines[0].expected, 200)
  assert.equal(sheet.lines[0].stockAtCount, 195)
  // Another sale after the line was entered, then the same number is saved again: the stock it
  // was compared with stays 195.
  as(cashier)
  await sell([piece(tabletBatch, 3, 1000)], 3000)
  as(admin)
  await ok(channels.inventory.recordCountLines, {
    countId,
    lines: [{ batchId: tabletBatch.id, counted: 195, reason: '' }]
  })
  sheet = (await ok(channels.inventory.getCount, countId)).count
  assert.equal(sheet.lines[0].stockAtCount, 195)
  assert.equal(sheet.differenceCount, 0)
  await ok(channels.inventory.completeCount, countId)
  assert.equal(await stock(tabletBatch.id), 192)
  // A real difference is still applied: 2 pieces missing from a shelf of 192.
  const secondCount = (await ok(channels.inventory.startCount, { drugId: tablet.id, notes: '' }))
    .data
  await ok(channels.inventory.recordCountLines, {
    countId: secondCount,
    lines: [{ batchId: tabletBatch.id, counted: 190, reason: '' }]
  })
  await bad(channels.inventory.completeCount, /reason/, secondCount)
  await ok(channels.inventory.recordCountLines, {
    countId: secondCount,
    lines: [{ batchId: tabletBatch.id, counted: 190, reason: 'Broken blister' }]
  })
  await ok(channels.inventory.completeCount, secondCount)
  assert.equal(await stock(tabletBatch.id), 190)

  // M3: the customer kept the medicine, so stock stays down and a loss is recorded.
  as(cashier)
  const kept = await sell([piece(tabletBatch, 4, 1000)], 4000)
  assert.equal(await stock(tabletBatch.id), 186)
  await bad(channels.sales.void, /came back/, {
    saleId: kept.id,
    reason: 'Rung up twice',
    approval: { username: 'qa-admin', password: 'SecondQaTest123' }
  })
  // L3: the administrator's username is matched without letter case, like sign-in.
  const keptVoid = (
    await ok(channels.sales.void, {
      saleId: kept.id,
      reason: 'Rung up twice',
      itemsReturned: false,
      approval: { username: 'QA-ADMIN', password: 'SecondQaTest123' }
    })
  ).sale
  assert.equal(keptVoid.status, 'voided')
  assert.equal(keptVoid.voidItemsReturned, 0)
  assert.equal(await stock(tabletBatch.id), 186)
  const loss = await db
    .selectFrom('stockOuts')
    .selectAll()
    .where('reason', 'like', `%${kept.reference}%`)
    .where('kind', '=', 'write_off')
    .executeTakeFirstOrThrow()
  assert.deepEqual([loss.quantity, loss.reasonCode], [4, 'lost'])
  // Medicines that came back go back to their batch.
  const returned = await sell([piece(tabletBatch, 2, 1000)], 2000)
  as(admin)
  await ok(channels.sales.void, {
    saleId: returned.id,
    reason: 'Wrong product',
    itemsReturned: true
  })
  assert.equal(await stock(tabletBatch.id), 186)

  // M4: a voided GCash reference can be used again on the corrected sale.
  as(cashier)
  const gcash = { paymentMethod: 'GCash', paymentReference: 'GC-REF-777' }
  const wrong = await sell([piece(tabletBatch, 1, 1000)], 1000, gcash)
  await bad(channels.sales.checkout, /already been recorded/, {
    requestId: randomUUID(),
    customerId: null,
    items: [piece(tabletBatch, 1, 1000)],
    expectedTotalCents: 1000,
    cashCents: 1000,
    ...gcash
  })
  as(admin)
  await ok(channels.sales.void, {
    saleId: wrong.id,
    reason: 'Rung wrong quantity',
    itemsReturned: true
  })
  as(cashier)
  await sell([piece(tabletBatch, 2, 1000)], 2000, gcash)

  // M2: a sale from an earlier day cannot be voided.
  const old = await sell([piece(tabletBatch, 1, 1000)], 1000)
  const earlier = new Date()
  earlier.setDate(earlier.getDate() - 3)
  await db
    .updateTable('sales')
    .set({ createdAt: earlier.toISOString() })
    .where('id', '=', old.id)
    .execute()
  as(admin)
  await bad(channels.sales.void, /Only today's sales/, {
    saleId: old.id,
    reason: 'Old mistake',
    itemsReturned: true
  })

  // L4: wrong approvals pause that cashier's approvals, not the administrator's sign-in.
  as(cashier)
  const pending = await sell([piece(tabletBatch, 1, 1000)], 1000)
  for (let attempt = 0; attempt < 5; attempt += 1)
    await bad(channels.sales.void, /incorrect/, {
      saleId: pending.id,
      reason: 'Wrong item rung up',
      itemsReturned: true,
      approval: { username: 'qa-admin', password: 'WrongPassword1' }
    })
  await bad(channels.sales.void, /Too many wrong approvals/, {
    saleId: pending.id,
    reason: 'Wrong item rung up',
    itemsReturned: true,
    approval: { username: 'qa-admin', password: 'SecondQaTest123' }
  })
  const adminRow = await db
    .selectFrom('accounts')
    .select(['failedAttempts', 'lockedUntil'])
    .where('id', '=', admin.id)
    .executeTakeFirstOrThrow()
  assert.deepEqual([adminRow.failedAttempts, adminRow.lockedUntil], [0, null])
  state.session = undefined
  await ok(channels.auth.signIn, { username: 'qa-admin', password: 'SecondQaTest123' })

  // L10: a dangerous-drug prescription is filled once.
  as(cashier)
  const prescription = {
    prescriberName: 'Dr. Jose Rizal',
    prescriberLicense: 'PRC-12345',
    prescriptionNumber: 'S2RX-0001',
    patientName: 'Pedro Reyes',
    patientAge: 54,
    patientAddress: 'Purok 2, Koronadal',
    prescriberAddress: 'Clinic Road, Koronadal',
    prescriberS2License: 'S2-7788'
  }
  await sell([piece(controlledBatch, 2, 1500)], 3000, { prescription })
  await bad(channels.sales.checkout, /already filled/, {
    requestId: randomUUID(),
    customerId: null,
    items: [piece(controlledBatch, 2, 1500)],
    expectedTotalCents: 3000,
    cashCents: 3000,
    prescription: { ...prescription, prescriptionNumber: 's2rx-0001' }
  })
  await sell([piece(controlledBatch, 2, 1500)], 3000, {
    prescription: { ...prescription, prescriptionNumber: 'S2RX-0002' }
  })

  // L6: "Expired" is refused on a batch that has not expired.
  as(admin)
  await bad(channels.inventory.recordStockOut, /has not expired/, {
    batchId: tabletBatch.id,
    quantity: 2,
    reasonCode: 'expired',
    reason: ''
  })
  await ok(channels.inventory.recordStockOut, {
    batchId: tabletBatch.id,
    quantity: 1,
    reasonCode: 'damaged',
    reason: ''
  })

  // L7: credit note numbers are compared without letter case.
  const credit = (number) => ({
    supplierId: supplier.id,
    creditNoteNumber: number,
    issuedAt: today,
    amount: 10
  })
  await ok(channels.supplierReturn.recordCreditNote, credit('CN-QA-1'))
  await bad(channels.supplierReturn.recordCreditNote, /already recorded/, credit('cn-qa-1'))

  // L8: a reversed date range is an error, not an empty register.
  await bad(channels.inventory.register, /end date/, {
    drugId: controlled.id,
    from: today,
    to: addDays(-5)
  })
  const register = (
    await ok(channels.inventory.register, { drugId: controlled.id, from: today, to: today })
  ).register
  assert.equal(register.closingBalance, register.stockOnHand)
  // The register of the product whose void was kept by the customer still reconciles.
  const tabletRegister = (
    await ok(channels.inventory.register, { drugId: tablet.id, from: today, to: today })
  ).register
  assert.equal(tabletRegister.closingBalance, tabletRegister.stockOnHand)
  assert.ok(tabletRegister.entries.some((entry) => /kept by the customer/.test(entry.remarks)))

  // L1 and L2: an over/short count needs a note; a second count needs a reason and replaces the
  // first. M2: a sale counted in the drawer can no longer be voided.
  as(cashier)
  const lastSale = await sell([piece(tabletBatch, 1, 1000)], 1000)
  const preview = (await ok(channels.sales.cashCountPreview)).preview
  assert.equal(preview.previousCountId, null)
  const expected = preview.cashSalesCents
  await bad(channels.sales.recordCashCount, /over or short/, {
    openingFloatCents: 0,
    denominations: {},
    notes: ''
  })
  const pesos = (cents) => ({ 1: cents / 100 })
  const first = (
    await ok(channels.sales.recordCashCount, {
      openingFloatCents: 0,
      denominations: pesos(expected - 100),
      notes: 'Short by 1 peso'
    })
  ).count
  assert.equal(first.differenceCents, -100)
  await bad(channels.sales.recordCashCount, /already saved a cash count/, {
    openingFloatCents: 0,
    denominations: pesos(expected),
    notes: ''
  })
  const recount = (
    await ok(channels.sales.recordCashCount, {
      openingFloatCents: 0,
      denominations: pesos(expected),
      notes: 'Found the peso under the tray'
    })
  ).count
  assert.equal(recount.recountOf, first.id)
  as(admin)
  const counts = (await ok(channels.sales.cashCounts, { from: today, to: today })).counts
  assert.equal(counts.find((row) => row.id === first.id).replacedBy, recount.id)
  const cashReport = (
    await ok(channels.reporting.generate, {
      kind: 'cashCounts',
      from: today,
      to: today,
      search: '',
      page: 1
    })
  ).report
  assert.equal(cashReport.metrics.find((item) => item.label === 'Net over / short').value, 0)
  await bad(channels.sales.void, /already counted/, {
    saleId: lastSale.id,
    reason: 'Wrong item rung up',
    itemsReturned: true
  })
  // QA Tests 3 rehearsal: the transactions list marks counted sales, so the Void button is hidden
  // for them; a sale rung up after the count can still be voided.
  as(cashier)
  const afterCount = await sell([piece(tabletBatch, 1, 1000)], 1000)
  const listed = (await ok(channels.sales.history)).records
  assert.equal(listed.find((row) => row.id === lastSale.id).drawerCounted, true)
  assert.equal(listed.find((row) => row.id === afterCount.id).drawerCounted, false)
  as(admin)

  // L11: an account with sales is kept and Block is offered; an unused one can be deleted.
  const blocked = await bad(channels.account.removeOneById, /1\d* sale\(s\)/, cashier.id)
  assert.equal(blocked.archivable, true)
  await ok(channels.account.removeOneById, unused.id)

  assert.equal((await sql`PRAGMA foreign_key_check`.execute(db)).rows.length, 0)
  console.log(
    'PASS: stock count during sales, same-day voids, kept medicines written off, voided e-wallet reference, Rx/controlled flags, cash count notes and recounts, approval case and lock, rejected boxes, Expired reason, credit note case, register dates, PO status log, S2 prescription filled once, account delete reason, repeat upgrade'
  )
  await db.destroy()
}
