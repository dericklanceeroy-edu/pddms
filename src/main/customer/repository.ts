import { db } from '@main/db'
import { noteAudit } from '@main/audit/repository'
import { customerDetail, type DeleteBlock, type DuplicateMatch } from '@shared/controls'
import { compactKey, phoneKey } from '@shared/duplicates'
import { normalizeDiscountId } from '@shared/schemas'
import { auditChanges } from '@shared/security'
import type { Customer, CustomerUpdate, NewCustomer } from '@shared/types'
import { sql } from 'kysely'

/** `cashierId` limits purchase history to that cashier's sales; `retailOnly` hides pharmacy clients. */
export async function findAll(cashierId?: number, retailOnly = false): Promise<
  Array<
    Customer & {
      transactions: Array<{ id: string; purchasedAt: string; itemCount: number; total: number }>
    }
  >
> {
  let customerQuery = db
    .selectFrom('customers')
    .selectAll()
    .where('isArchived', '=', 0)
    .orderBy('fullName')
  if (retailOnly) customerQuery = customerQuery.where('clientType', '=', 'retail')
  const customers = await customerQuery.execute()
  let query = db
    .selectFrom('sales')
    .innerJoin('saleItems', 'saleItems.saleId', 'sales.id')
    .select([
      'sales.id',
      'sales.reference',
      'sales.customerId',
      'sales.createdAt',
      'sales.totalCents',
      'sales.status'
    ])
    .select(({ fn }) =>
      fn.sum<number>(sql<number>`sale_items.quantity * sale_items.pieces_per_unit`).as('itemCount')
    )
    .where('sales.customerId', 'is not', null)
    .groupBy('sales.id')
    .orderBy('sales.id', 'desc')
  if (cashierId !== undefined) query = query.where('sales.cashierId', '=', cashierId)
  const sales = await query.execute()
  return customers.map((customer) => ({
    ...customer,
    transactions: sales
      .filter((sale) => sale.customerId === customer.id)
      .map((sale) => ({
        id: sale.reference,
        purchasedAt: sale.createdAt,
        itemCount: Number(sale.itemCount),
        total: sale.status === 'voided' ? 0 : sale.totalCents / 100,
        voided: sale.status === 'voided'
      }))
  }))
}

export async function findOneById(id: number): Promise<Customer | undefined> {
  return db.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst()
}

/** A possible duplicate the user is asked about before saving. */
export class DuplicateWarning extends Error {
  constructor(
    message: string,
    readonly matches: DuplicateMatch[]
  ) {
    super(message)
  }
}


/**
 * Duplicate rules.
 * Retail customers: the same name is allowed (two people can share a name), but each mobile number
 * and each Senior/PWD ID belongs to one customer. A name already on file needs confirmation.
 * Pharmacy clients: the same name is allowed only for another branch (different address); a
 * mobile number or TIN already used by another client needs confirmation.
 */
async function checkDuplicates(
  data: Pick<Customer, 'fullName' | 'phone' | 'discountId' | 'address' | 'clientType' | 'tin'>,
  current: Customer | undefined,
  confirmed: boolean
): Promise<void> {
  const exceptId = current?.id
  const others = (
    await db
      .selectFrom('customers')
      .selectAll()
      .where('isArchived', '=', 0)
      .where('clientType', '=', data.clientType)
      .execute()
  ).filter((customer) => customer.id !== exceptId)
  const name = compactKey(data.fullName)
  const mobile = phoneKey(data.phone)
  const sameName = others.filter((customer) => compactKey(customer.fullName) === name)
  const toMatch = (customer: Customer): DuplicateMatch => ({
    id: customer.id,
    fullName: customer.fullName,
    detail: customerDetail(customer)
  })
  if (data.clientType === 'retail') {
    // Note: Only a newly typed number or ID is checked, so a duplicate saved before this rule
    // (to be merged by the administrator) never blocks editing other details of the record.
    const phoneChanged = !current || phoneKey(current.phone) !== mobile
    const phoneOwner =
      phoneChanged && others.find((customer) => phoneKey(customer.phone) === mobile)
    if (phoneOwner)
      throw new Error(
        `Mobile number ${data.phone} already belongs to ${phoneOwner.fullName}. Each customer needs their own number; open that profile instead.`
      )
    const idKey = (value: string | null | undefined): string =>
      value ? normalizeDiscountId(value).toUpperCase() : ''
    const id = idKey(data.discountId)
    const idOwner =
      id &&
      id !== idKey(current?.discountId) &&
      others.find(
        (customer) =>
          customer.discountId && normalizeDiscountId(customer.discountId).toUpperCase() === id
      )
    if (idOwner)
      throw new Error(
        `Senior/PWD ID ${data.discountId} is already on ${idOwner.fullName}'s profile. One ID belongs to one person.`
      )
    if (sameName.length && !confirmed)
      throw new DuplicateWarning(
        `A customer named ${data.fullName} is already saved. Open the existing profile, or save a new one if this is a different person.`,
        sameName.map(toMatch)
      )
    return
  }
  const address = compactKey(data.address ?? '')
  const branchChanged =
    !current ||
    compactKey(current.fullName) !== name ||
    compactKey(current.address ?? '') !== address
  const sameBranch =
    branchChanged && sameName.find((customer) => compactKey(customer.address ?? '') === address)
  if (sameBranch)
    throw new Error(
      `${sameBranch.fullName} at this address is already saved. A pharmacy with the same name must be a different branch (different address).`
    )
  const tin = (data.tin ?? '').replace(/\D/g, '')
  const shared = others.filter(
    (customer) =>
      phoneKey(customer.phone) === mobile ||
      (tin && (customer.tin ?? '').replace(/\D/g, '') === tin)
  )
  if (shared.length && !confirmed)
    throw new DuplicateWarning(
      `This mobile number or TIN is already used by another pharmacy client. Check that this is not the same client before saving.`,
      shared.map(toMatch)
    )
}

const customerLabels = {
  fullName: 'Name',
  contactPerson: 'Contact person',
  phone: 'Mobile',
  email: 'Email',
  address: 'Address',
  tin: 'TIN',
  clientType: 'Client type',
  discountType: 'Discount',
  discountId: 'Discount ID',
  discountExpiresAt: 'Discount ID expiry'
}

export async function insertOne(data: NewCustomer, confirmed = false): Promise<Customer> {
  await checkDuplicates(
    {
      fullName: data.fullName,
      phone: data.phone,
      discountId: data.discountId ?? null,
      address: data.address ?? null,
      clientType: data.clientType ?? 'retail',
      tin: data.tin ?? null
    },
    undefined,
    confirmed
  )
  return await db.insertInto('customers').values(data).returningAll().executeTakeFirstOrThrow()
}

export async function updateOneById(
  id: number,
  data: CustomerUpdate,
  confirmed = false
): Promise<Customer> {
  const current = await findOneById(id)
  if (!current || current.isArchived) throw new Error('Customer not found.')
  const next = { ...current, ...data } as Customer
  // Note: Re-saving a record unchanged never asks about duplicates that already existed.
  const sameIdentity =
    compactKey(next.fullName) === compactKey(current.fullName) &&
    phoneKey(next.phone) === phoneKey(current.phone) &&
    (next.tin ?? '') === (current.tin ?? '')
  await checkDuplicates(next, current, confirmed || sameIdentity)
  const customer = await db
    .updateTable('customers')
    .set({ ...data, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
  noteAudit({ summary: current.fullName, changes: auditChanges(current, data, customerLabels) })
  return customer
}

/** Why a customer or pharmacy client cannot be deleted. */
export async function deleteBlock(id: number): Promise<DeleteBlock | null> {
  const count = async (table: 'sales' | 'wholesaleOrders'): Promise<number> =>
    Number(
      (
        await db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('customerId', '=', id)
          .executeTakeFirstOrThrow()
      ).count
    )
  const [sales, orders] = await Promise.all([count('sales'), count('wholesaleOrders')])
  const uses = [sales && `${sales} sale(s)`, orders && `${orders} wholesale order(s)`].filter(Boolean)
  return uses.length
    ? {
        reason: `Used in ${uses.join(' and ')}. Archive it instead: old receipts keep the name, and it is hidden from new sales and orders.`,
        archivable: true
      }
    : null
}

export async function removeOneById(id: number): Promise<void> {
  const block = await deleteBlock(id)
  if (block) throw new Error(block.reason)
  const customer = await findOneById(id)
  await db.deleteFrom('customers').where('id', '=', id).executeTakeFirstOrThrow()
  noteAudit({ summary: `Deleted ${customer?.fullName ?? 'record'} (never used)` })
}

export async function setArchived(id: number, archived: boolean): Promise<Customer> {
  const customer = await findOneById(id)
  if (!customer) throw new Error('Customer not found.')
  if (!archived) {
    if (customer.mergedInto)
      throw new Error('This record was merged into another one and cannot be restored.')
    await checkDuplicates(customer, undefined, true)
  }
  const saved = await db
    .updateTable('customers')
    .set({ isArchived: archived ? 1 : 0, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow()
  noteAudit({
    summary: `${customer.fullName} ${archived ? 'archived' : 'restored'}`,
    changes: [{ field: 'Archived', from: customer.isArchived === 1, to: archived }]
  })
  return saved
}

export async function findArchived(): Promise<Customer[]> {
  return db
    .selectFrom('customers')
    .selectAll()
    .where('isArchived', '=', 1)
    .orderBy('fullName')
    .execute()
}

/**
 * Merges a duplicate into the record to keep: its sales and wholesale orders move to the kept
 * record (receipts keep the name printed on them), and the duplicate is archived as merged.
 */
export async function mergeInto(sourceId: number, targetId: number): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const [source, target] = await Promise.all(
      [sourceId, targetId].map((id) =>
        transaction.selectFrom('customers').selectAll().where('id', '=', id).executeTakeFirst()
      )
    )
    if (!source || !target) throw new Error('Customer not found.')
    if (source.isArchived || target.isArchived)
      throw new Error('Restore archived records before merging them.')
    if (source.clientType !== target.clientType)
      throw new Error('A retail customer and a pharmacy client cannot be merged.')
    const sales = await transaction
      .updateTable('sales')
      .set({ customerId: target.id })
      .where('customerId', '=', source.id)
      .executeTakeFirst()
    const orders = await transaction
      .updateTable('wholesaleOrders')
      .set({ customerId: target.id })
      .where('customerId', '=', source.id)
      .executeTakeFirst()
    await transaction
      .updateTable('customers')
      .set({ isArchived: 1, mergedInto: target.id, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where('id', '=', source.id)
      .execute()
    noteAudit({
      summary: `Merged ${source.fullName} (${customerDetail(source)}) into ${target.fullName} (${customerDetail(target)})`,
      changes: [
        { field: 'Sales moved', from: null, to: Number(sales.numUpdatedRows) },
        { field: 'Wholesale orders moved', from: null, to: Number(orders.numUpdatedRows) }
      ]
    })
  })
}
