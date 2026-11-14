import z from 'zod'
import { isoDateSchema } from './schemas'

export const reportTitles = {
  sales: 'Daily / Period Retail Sales',
  inventory: 'Current Inventory & Stock Valuation',
  movement: 'Fast / Slow-Moving Products',
  financial: 'Revenue, Expenses & Financial Summary',
  income: 'Retail & Wholesale Income',
  cash: 'Recorded Cash Inconsistencies',
  overdue: 'Overdue Accounts Receivable',
  arPayments: 'Accounts Receivable Payments',
  apPayments: 'Accounts Payable Payments',
  discounts: 'Discount Monitoring',
  regulated: 'Regulated Product Sales',
  products: 'Product Information & Summaries'
} as const
export type ReportKind = keyof typeof reportTitles

const minorWords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'vs',
  'with'
])
/** Title case for headings and labels; acronyms such as AR and AP keep their capitals. */
export const titleCase = (text: string): string =>
  text.replace(/[A-Za-z][A-Za-z']*/g, (word, offset: number) =>
    offset > 0 && minorWords.has(word) && !/[(/-]\s*$/.test(text.slice(0, offset))
      ? word
      : word[0].toUpperCase() + word.slice(1)
  )
export const reportSchema = z
  .strictObject({
    kind: z.enum(Object.keys(reportTitles) as [ReportKind, ...ReportKind[]]),
    from: isoDateSchema('Enter a valid start date.'),
    to: isoDateSchema('Enter a valid end date.'),
    search: z.string().trim().max(120).default(''),
    page: z.number().int().min(1).max(1_000_000).default(1)
  })
  .refine((value) => value.from <= value.to, {
    path: ['to'],
    message: 'End date must not precede start date.'
  })
export type ReportFilter = z.infer<typeof reportSchema>
export interface ReportColumn {
  key: string
  label: string
  format?: 'money' | 'dateTime'
  productLink?: boolean
}
export type ReportRow = Record<string, string | number | null>
export interface ReportMetric {
  label: string
  value: number
  format?: 'money'
}
export interface BusinessReport {
  title: string
  generatedAt: string
  filter: ReportFilter
  notes: string[]
  columns: ReportColumn[]
  rows: ReportRow[]
  metrics: ReportMetric[]
  totalRows: number
  pageSize: number
}
export function dateBounds(from: string, to: string): { start: string; end: string } {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
