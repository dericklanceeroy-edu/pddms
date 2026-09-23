import z from 'zod'
import { isoDateSchema } from './schemas'

export const reportTitles = {
  sales: 'Daily / period retail sales',
  inventory: 'Current inventory & stock valuation',
  movement: 'Fast / slow-moving products',
  financial: 'Revenue, expenses & financial summary',
  income: 'Retail & wholesale income',
  cash: 'Recorded cash inconsistencies',
  overdue: 'Overdue accounts receivable',
  arPayments: 'Accounts receivable payments',
  apPayments: 'Accounts payable payments',
  discounts: 'Discount monitoring',
  regulated: 'Regulated product sales',
  products: 'Product information & summaries'
} as const
export type ReportKind = keyof typeof reportTitles
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
