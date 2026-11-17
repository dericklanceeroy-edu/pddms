/**
 * Keys used to spot duplicate records. Two names count as the same when they match after ignoring
 * letter case, spacing and punctuation, so "QA Pharma Supply, Inc." equals "qa pharma supply inc".
 */
export const compactKey = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.,'’()/-]+/g, '')

/**
 * Product names and formulations also ignore a plural "s", so "500 mg Tablets" equals
 * "500mg Tablet". A word ending in "ss" keeps its letters.
 */
export const productKey = (value: string): string =>
  compactKey(
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[.,'’()/-]+/g, ' ')
      .split(/\s+/)
      .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
      .join(' ')
  )

/** Mobile numbers compare by digits, so "0917 123 4567" equals "09171234567". */
export const phoneKey = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '').replace(/^63/, '0')
