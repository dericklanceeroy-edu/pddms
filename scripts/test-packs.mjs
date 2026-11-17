/* eslint-disable @typescript-eslint/explicit-function-return-type -- Executable JavaScript harness. */
/**
 * Test helper: purchase orders now pick packs from the supplier price list. Older test steps that
 * describe a line as product + cost per box are turned into price list packs here (one per
 * supplier, product and box size; a new cost is added as the current price).
 */
import { localDate } from '../src/shared/inventory.ts'

export async function packLines(db, supplierId, items) {
  const { createPack, setPackPrice } = await import('../src/main/price-list/repository.ts')
  const lines = []
  for (const item of items) {
    const piecesPerBox = item.piecesPerBox ?? 1
    let pack = await db
      .selectFrom('supplierPacks')
      .select('id')
      .where('supplierId', '=', supplierId)
      .where('drugId', '=', item.drugId)
      .where('piecesPerBox', '=', piecesPerBox)
      .executeTakeFirst()
    const price = {
      unitCost: item.unitCost,
      effectiveFrom: localDate(),
      quotationReference: 'TEST-QUOTE'
    }
    if (!pack)
      pack = {
        id: await createPack({ supplierId, drugId: item.drugId, piecesPerBox, ...price }, null)
      }
    else await setPackPrice({ packId: pack.id, ...price }, null)
    lines.push({ packId: pack.id, quantity: item.quantity })
  }
  return lines
}
