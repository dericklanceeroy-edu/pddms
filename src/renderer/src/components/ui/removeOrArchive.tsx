import { RequestError } from '@renderer/services/controls'
import type { ConfirmOptions } from './ConfirmDialog'

/**
 * Delete for records that were never used, archive for records with history.
 *
 * Asks before deleting. When the main process refuses because the record is used in sales,
 * orders or stock, the reason it gives (e.g. "Used in 12 sales") is shown and the person can
 * archive instead: the record stays on old receipts and reports, is hidden from new sales and
 * orders, and the administrator can restore it under Administration.
 */
export async function removeOrArchive({
  confirm,
  name,
  noun,
  remove,
  archive
}: {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  name: string
  noun: string
  remove: () => Promise<void>
  archive: () => Promise<void>
}): Promise<'deleted' | 'archived' | null> {
  const accepted = await confirm({
    title: `Delete ${noun}?`,
    message: (
      <>
        <strong>{name}</strong> will be deleted permanently. Only records that were never used can
        be deleted; if it has history you will be offered to archive it instead.
      </>
    ),
    confirmLabel: `Delete ${noun[0].toUpperCase()}${noun.slice(1)}`,
    tone: 'danger'
  })
  if (!accepted) return null
  try {
    await remove()
    return 'deleted'
  } catch (cause) {
    if (!(cause instanceof RequestError) || !cause.archivable) throw cause
    const archiveIt = await confirm({
      title: `Archive ${noun} instead?`,
      message: (
        <>
          <p>
            <strong>{name}</strong> cannot be deleted. {cause.message}
          </p>
          <p className="mt-2">
            Archiving keeps it on old receipts and reports and hides it from new sales and orders.
            The administrator can restore it under Administration, Archived Records.
          </p>
        </>
      ),
      confirmLabel: `Archive ${noun[0].toUpperCase()}${noun.slice(1)}`
    })
    if (!archiveIt) return null
    await archive()
    return 'archived'
  }
}
