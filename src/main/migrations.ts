import { db } from '@main/db'
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration'
import * as createAccounts from '../../migrations/1785501403133_create_accounts_table'
import * as createDrugs from '../../migrations/1786732875171_create_drugs_table'
import * as createSuppliers from '../../migrations/1786732898928_create_suppliers_table'
import * as createBatches from '../../migrations/1786733456952_create_batches_table'

class BundledMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      '1785501403133_create_accounts_table': createAccounts,
      '1786732875171_create_drugs_table': createDrugs,
      '1786732898928_create_suppliers_table': createSuppliers,
      '1786733456952_create_batches_table': createBatches
    }
  }
}

export async function migrateDatabase(): Promise<void> {
  const migrator = new Migrator({ db, provider: new BundledMigrationProvider() })
  const { error } = await migrator.migrateToLatest()

  if (error) throw error
}
