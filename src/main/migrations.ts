import { db } from '@main/db'
import { up as createAccounts } from '../../migrations/1785501403133_create_accounts_table'
import { up as createDrugs } from '../../migrations/1786732875171_create_drugs_table'
import { up as createSuppliers } from '../../migrations/1786732898928_create_suppliers_table'
import { up as createBatches } from '../../migrations/1786733456952_create_batches_table'
import { up as completeProfilesSchema } from '../../migrations/1788278400000_complete_profiles_schema'
import { up as refineAccountRoles } from '../../migrations/1789000000000_refine_account_roles'
import { up as createPurchaseOrders } from '../../migrations/1789000100000_create_purchase_orders_tables'
import { up as enforceAccountRoles } from '../../migrations/1789000200000_enforce_account_roles'

export async function initializeDatabase(): Promise<void> {
  const existingTables = new Set((await db.introspection.getTables()).map((table) => table.name))

  if (!existingTables.has('accounts')) await createAccounts(db)
  if (!existingTables.has('drugs')) await createDrugs(db)
  if (!existingTables.has('suppliers')) await createSuppliers(db)
  if (!existingTables.has('batches')) await createBatches(db)
  await completeProfilesSchema(db)
  await refineAccountRoles(db)
  await enforceAccountRoles(db)
  await createPurchaseOrders(db)
}
