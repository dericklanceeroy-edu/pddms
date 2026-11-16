import { noteAudit } from '@main/audit/repository'
import { db } from '@main/db'
import type { DeleteBlock } from '@shared/controls'
import { auditChanges } from '@shared/security'
import { productKey } from '@shared/duplicates'
import type { Database, Drug, DrugUpdate, NewProduct, Product, ProductUpdate } from '@shared/types'
import { sql, type Transaction } from 'kysely'

export interface ProductWithInventory extends Product {
  batches: Array<{
    id: number
    batchNumber: string
    supplier: string
    stock: number
    sellPrice: number
    boxSellPrice: number | null
    wholesaleBoxPrice: number | null
    /** Pieces in one box of this batch, as it arrived from the supplier. */
    piecesPerBox: number
    expiresAt: Date
    receipts: Array<{ orderNumber: string; deliveredAt: string; quantity: number }>
  }>
}

export async function findAll(): Promise<ProductWithInventory[]> {
  const products = await db
    .selectFrom('drugs')
    .selectAll()
    .where('isArchived', '=', 0)
    .orderBy('brandName')
    .execute()
  const batches = await db
    .selectFrom('batches')
    .innerJoin('suppliers', 'suppliers.id', 'batches.supplierId')
    .select([
      'batches.id',
      'batches.drugId',
      'batches.physicalTag',
      'batches.currentStock',
      'batches.sellPrice',
      'batches.boxSellPrice',
      'batches.wholesaleBoxPrice',
      'batches.piecesPerBox',
      'batches.expiresAt',
      'suppliers.organization'
    ])
    // Note: First expiry, first out: the batch to sell first is listed first.
    .orderBy('batches.expiresAt')
    .orderBy('batches.id')
    .execute()

  const receipts = await db
    .selectFrom('supplierDeliveryItems')
    .innerJoin('supplierDeliveries', 'supplierDeliveries.id', 'supplierDeliveryItems.deliveryId')
    .innerJoin('purchaseOrders', 'purchaseOrders.id', 'supplierDeliveries.purchaseOrderId')
    .innerJoin(
      'purchaseOrderItems',
      'purchaseOrderItems.id',
      'supplierDeliveryItems.purchaseOrderItemId'
    )
    .select([
      'supplierDeliveryItems.batchId',
      // Note: Receipts are listed in pieces, the same unit as batch stock.
      sql<number>`supplier_delivery_items.quantity * purchase_order_items.pieces_per_unit`.as(
        'quantity'
      ),
      'purchaseOrders.orderNumber',
      'supplierDeliveries.deliveredAt'
    ])
    .orderBy('supplierDeliveries.deliveredAt', 'desc')
    .execute()
  const batchesByProduct = new Map<number, typeof batches>()
  const receiptsByBatch = new Map<number, typeof receipts>()
  for (const batch of batches) {
    const productBatches = batchesByProduct.get(batch.drugId) ?? []
    productBatches.push(batch)
    batchesByProduct.set(batch.drugId, productBatches)
  }
  for (const receipt of receipts) {
    const batchReceipts = receiptsByBatch.get(receipt.batchId) ?? []
    batchReceipts.push(receipt)
    receiptsByBatch.set(receipt.batchId, batchReceipts)
  }

  return products.map((product) => ({
    ...toProduct(product),
    batches: (batchesByProduct.get(product.id) ?? []).map((batch) => ({
      id: batch.id,
      batchNumber: batch.physicalTag ?? `Batch ${batch.id}`,
      supplier: batch.organization,
      stock: batch.currentStock,
      sellPrice: batch.sellPrice,
      boxSellPrice: batch.boxSellPrice,
      wholesaleBoxPrice: batch.wholesaleBoxPrice,
      piecesPerBox: batch.piecesPerBox,
      expiresAt: batch.expiresAt,
      receipts: (receiptsByBatch.get(batch.id) ?? []).map(
        ({ orderNumber, deliveredAt, quantity }) => ({ orderNumber, deliveredAt, quantity })
      )
    }))
  }))
}

/**
 * Rejects a product whose brand and formulation match another active product after ignoring case,
 * spacing, punctuation and plural forms ("500 mg Tablets" and "500mg Tablet").
 */
async function rejectDuplicate(
  transaction: Transaction<Database>,
  brandName: string,
  formulation: string,
  exceptId?: number
): Promise<void> {
  const products = await transaction
    .selectFrom('drugs')
    .select(['id', 'brandName', 'formulation'])
    .where('isArchived', '=', 0)
    .execute()
  const brand = productKey(brandName)
  const form = productKey(formulation)
  const match = products.find(
    (product) =>
      product.id !== exceptId &&
      productKey(product.brandName) === brand &&
      productKey(product.formulation) === form
  )
  if (match)
    throw new Error(
      `A product with this brand and formulation already exists: ${match.brandName} ${match.formulation}.`
    )
}

/** Sets or clears the price of one box for pharmacy clients on a batch; never below its box cost. */
export async function setWholesalePrice(batchId: number, price: number | null): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const batch = await transaction
      .selectFrom('batches')
      .innerJoin('drugs', 'drugs.id', 'batches.drugId')
      .select([
        'batches.id',
        'batches.buyPrice',
        'batches.physicalTag',
        'batches.piecesPerBox',
        'batches.wholesaleBoxPrice',
        'drugs.brandName'
      ])
      .where('batches.id', '=', batchId)
      .where('drugs.isArchived', '=', 0)
      .executeTakeFirst()
    if (!batch) throw new Error('Batch not found.')
    const boxCost = batch.buyPrice * Math.max(1, batch.piecesPerBox)
    if (price !== null && price < boxCost - 0.005)
      throw new Error(
        `Batch ${batch.physicalTag ?? batch.id}: the wholesale price cannot be lower than the cost of ₱${boxCost.toFixed(2)} per box.`
      )
    await transaction
      .updateTable('batches')
      .set({ wholesaleBoxPrice: price })
      .where('id', '=', batchId)
      .executeTakeFirstOrThrow()
    noteAudit({
      summary: `${batch.brandName}, batch ${batch.physicalTag ?? batch.id}: wholesale price per box`,
      changes: [{ field: 'Wholesale price per box', from: batch.wholesaleBoxPrice, to: price }]
    })
  })
}

const toProduct = (drug: Drug): Product => ({
  ...drug,
  isPrescribed: drug.isPrescribed === 1,
  isControlled: drug.isControlled === 1
})

export async function insertOne(data: NewProduct): Promise<Product> {
  return db.transaction().execute(async (transaction) => {
    await rejectDuplicate(transaction, data.brandName, data.formulation)
    const drug = await transaction
      .insertInto('drugs')
      .values({
        ...data,
        isPrescribed: data.isPrescribed ? 1 : 0,
        isControlled: data.isControlled ? 1 : 0
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    return toProduct(drug)
  })
}

export async function updateOneById(
  id: number,
  data: ProductUpdate,
  isAdministrator = false
): Promise<Product> {
  return db.transaction().execute(async (transaction) => {
    const current = await transaction
      .selectFrom('drugs')
      .selectAll()
      .where('id', '=', id)
      .where('isArchived', '=', 0)
      .executeTakeFirst()
    if (!current) throw new Error('Product not found.')
    await rejectDuplicate(
      transaction,
      data.brandName ?? current.brandName,
      data.formulation ?? current.formulation,
      id
    )
    // Note: Removing the Rx or controlled flag lets the medicine sell without a prescription or
    // register entry, so only the administrator may do it. Anyone who edits products may add one.
    if (!isAdministrator) {
      if (data.isPrescribed === false && current.isPrescribed === 1)
        throw new Error('Only the administrator can remove "Prescription required" from a medicine.')
      if (data.isControlled === false && current.isControlled === 1)
        throw new Error('Only the administrator can remove the controlled (dangerous drug) flag.')
    }
    const { isPrescribed, isControlled, ...details } = data
    const values: DrugUpdate = { ...details }
    if (isPrescribed !== undefined) values.isPrescribed = isPrescribed ? 1 : 0
    if (isControlled !== undefined) values.isControlled = isControlled ? 1 : 0
    const drug = await transaction
      .updateTable('drugs')
      .set(values)
      .where('id', '=', id)
      .where('isArchived', '=', 0)
      .returningAll()
      .executeTakeFirstOrThrow()
    noteAudit({
      summary: `${current.brandName} ${current.formulation}`,
      changes: auditChanges(
        { ...current, isPrescribed: current.isPrescribed === 1, isControlled: current.isControlled === 1 },
        data as Record<string, unknown>,
        productLabels
      )
    })
    return toProduct(drug)
  })
}

const productLabels = {
  brandName: 'Brand name',
  genericName: 'Generic name',
  formulation: 'Formulation',
  category: 'Category',
  isPrescribed: 'Prescription required',
  isControlled: 'Controlled (dangerous drug)',
  reorderLevel: 'Reorder level'
}

/** Why a product cannot be deleted: anything with stock, order or sale history is archived. */
export async function deleteBlock(id: number): Promise<DeleteBlock | null> {
  const count = async (table: 'batches' | 'purchaseOrderItems' | 'saleItems' | 'wholesaleOrderItems'): Promise<number> =>
    Number(
      (
        await db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('drugId', '=', id)
          .executeTakeFirstOrThrow()
      ).count
    )
  const [batches, orders, sales, wholesale] = await Promise.all([
    count('batches'),
    count('purchaseOrderItems'),
    count('saleItems'),
    count('wholesaleOrderItems')
  ])
  const uses = [
    sales && `${sales} sale line(s)`,
    wholesale && `${wholesale} wholesale order line(s)`,
    orders && `${orders} purchase order line(s)`,
    batches && `${batches} stock batch(es)`
  ].filter(Boolean)
  return uses.length
    ? {
        reason: `Used in ${uses.join(', ')}. Archive it instead: it stays on old receipts and reports but is hidden from new sales and orders.`,
        archivable: true
      }
    : null
}

/** Permanently deletes a product that was never stocked, ordered or sold. */
export async function removeOneById(id: number): Promise<void> {
  const product = await db.selectFrom('drugs').selectAll().where('id', '=', id).executeTakeFirst()
  if (!product) throw new Error('Product not found.')
  const block = await deleteBlock(id)
  if (block) throw new Error(block.reason)
  await db.transaction().execute(async (transaction) => {
    // Note: Price list entries of a never-ordered product are set-up only, not history.
    const packs = transaction.selectFrom('supplierPacks').select('id').where('drugId', '=', id)
    await transaction.deleteFrom('supplierPackPrices').where('packId', 'in', packs).execute()
    await transaction.deleteFrom('supplierPacks').where('drugId', '=', id).execute()
    await transaction.deleteFrom('drugs').where('id', '=', id).executeTakeFirstOrThrow()
  })
  noteAudit({ summary: `Deleted ${product.brandName} ${product.formulation} (never used)` })
}

export async function setArchived(id: number, archived: boolean): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const product = await transaction
      .selectFrom('drugs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (!product) throw new Error('Product not found.')
    if (!archived) await rejectDuplicate(transaction, product.brandName, product.formulation, id)
    await transaction
      .updateTable('drugs')
      .set({ isArchived: archived ? 1 : 0 })
      .where('id', '=', id)
      .execute()
    noteAudit({
      summary: `${product.brandName} ${product.formulation} ${archived ? 'archived' : 'restored'}`,
      changes: [{ field: 'Archived', from: product.isArchived === 1, to: archived }]
    })
  })
}

export async function findArchived(): Promise<Product[]> {
  return (
    await db.selectFrom('drugs').selectAll().where('isArchived', '=', 1).orderBy('brandName').execute()
  ).map(toProduct)
}
