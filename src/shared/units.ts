import z from 'zod'

/**
 * Stock is always counted in pieces. A box is a selling or ordering unit that converts to
 * `piecesPerBox` pieces of the same product.
 */
export const stockUnits = ['piece', 'box'] as const
export type StockUnit = (typeof stockUnits)[number]
export const stockUnitSchema = z.enum(stockUnits)

// Note: A generous upper bound that still keeps piece totals far inside safe integers.
export const MAX_PIECES_PER_BOX = 10_000
export const piecesPerBoxSchema = z
  .number()
  .int('Pieces per box must be a whole number.')
  .min(1, 'Pieces per box must be at least 1.')
  .max(MAX_PIECES_PER_BOX, `Pieces per box cannot exceed ${MAX_PIECES_PER_BOX}.`)

export class UnitError extends Error {}

/**
 * Pieces in one unit of the given kind. A product packed one piece per box (a bottle, a tube)
 * still counts as a box of 1, because purchase orders and wholesale orders are per box only.
 */
export function piecesPerUnit(unit: StockUnit, piecesPerBox: number): number {
  if (unit === 'piece') return 1
  if (!Number.isInteger(piecesPerBox) || piecesPerBox < 1)
    throw new UnitError(
      'This product is not set up for box quantities. Set pieces per box on the product first.'
    )
  return piecesPerBox
}

/**
 * Pieces in one unit sold at the counter. Retail box sales need a real multi-piece box; a product
 * packed one per box is sold by the piece.
 */
export function saleUnitPieces(unit: StockUnit, piecesPerBox: number): number {
  if (unit === 'box' && piecesPerBox <= 1)
    throw new UnitError('This product is sold by the piece. It has no multi-piece box.')
  return piecesPerUnit(unit, piecesPerBox)
}

/** Box-only flows: supplier purchase orders and wholesale orders never use pieces. */
export const boxOnlyUnitSchema = z.literal('box', {
  error: 'Purchase orders and wholesale orders are per box only.'
})

/** Selling price of one unit in pesos. A batch without its own box price sells a box at piece price × pieces. */
export function unitSellPrice(
  unit: StockUnit,
  sellPrice: number,
  boxSellPrice: number | null,
  piecesPerBox: number
): number {
  if (unit === 'piece') return sellPrice
  const pieces = piecesPerUnit('box', piecesPerBox)
  return boxSellPrice ?? Number((sellPrice * pieces).toFixed(2))
}

/** Whole units of the given kind that the pieces on hand can fill. */
export const availableUnits = (
  stockPieces: number,
  unit: StockUnit,
  piecesPerBox: number
): number => Math.floor(stockPieces / piecesPerUnit(unit, piecesPerBox))

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : word === 'box' ? 'es' : 's'}`

/** "3 boxes (×10 pcs)" or "4 pieces". */
export function quantityLabel(
  quantity: number,
  unit: StockUnit,
  piecesPerUnitValue: number
): string {
  return unit === 'box'
    ? `${plural(quantity, 'box')} (×${piecesPerUnitValue} pcs)`
    : plural(quantity, 'piece')
}

/** Short unit word for prices: "box of 10" or "piece". */
export const unitWord = (unit: StockUnit, piecesPerUnitValue: number): string =>
  unit === 'box' ? `box of ${piecesPerUnitValue}` : 'piece'

/** "25 pieces (2 boxes + 5 pieces)" for products sold by the box, otherwise "25 pieces". */
export function piecesLabel(pieces: number, piecesPerBox: number): string {
  if (piecesPerBox <= 1 || pieces < piecesPerBox) return plural(pieces, 'piece')
  const boxes = Math.floor(pieces / piecesPerBox)
  const rest = pieces % piecesPerBox
  return `${plural(pieces, 'piece')} (${plural(boxes, 'box')}${rest ? ` + ${plural(rest, 'piece')}` : ''})`
}
