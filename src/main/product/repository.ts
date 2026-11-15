import { db } from '@main/db'
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
      'batches.expiresAt',
      'suppliers.organization'
    ])
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
      .select(['batches.id', 'batches.buyPrice', 'batches.physicalTag', 'drugs.piecesPerBox'])
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

export async function updateOneById(id: number, data: ProductUpdate): Promise<Product> {
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
    if (data.piecesPerBox !== undefined && data.piecesPerBox !== current.piecesPerBox) {
      const stock = await transaction
        .selectFrom('batches')
        .select((eb) => eb.fn.sum<number>('currentStock').as('pieces'))
        .where('drugId', '=', id)
        .executeTakeFirstOrThrow()
      const pieces = Number(stock.pieces ?? 0)
      if (pieces > 0 && !data.confirmPiecesChange)
        throw new Error(
          `This product has ${pieces} piece(s) in stock, counted in boxes of ${current.piecesPerBox}. Confirm the change to pieces per box: stock stays in pieces, but box counts and box prices will use boxes of ${data.piecesPerBox}.`
        )
    }
    const { isPrescribed, isControlled, confirmPiecesChange, ...details } = data
    void confirmPiecesChange
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
    return toProduct(drug)
  })
}

export async function removeOneById(id: number): Promise<void> {
  await db
    .updateTable('drugs')
    .set({ isArchived: 1 })
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}
