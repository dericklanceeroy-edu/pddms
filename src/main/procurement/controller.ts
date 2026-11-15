import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { windowDialog } from '@main/api/dialogs'
import { ipcMain } from '@main/api/ipc'
import { channels, resources } from '@shared/constants'
import { supplierInvoiceUploadSchema, supplierPaymentSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { app, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  findDeliveries,
  findInvoiceFile,
  findInvoices,
  findPaymentSummaries,
  findPayments,
  insertInvoice,
  insertPayment
} from './repository'

const invoiceDirectory = (): string => join(app.getPath('userData'), 'supplier-invoices')
const invoiceExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp'])

/** Largest invoice file accepted; scans and photos of invoices are well under this. */
const MAX_INVOICE_BYTES = 20 * 1024 * 1024

/**
 * Checks the first bytes of the file against its extension, so a renamed file (for example an
 * executable saved as .pdf) is refused.
 */
async function hasInvoiceSignature(path: string, extension: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const head = Buffer.alloc(12)
    const { bytesRead } = await handle.read(head, 0, 12, 0)
    const bytes = head.subarray(0, bytesRead)
    const starts = (signature: number[], offset = 0): boolean =>
      signature.every((value, index) => bytes[offset + index] === value)
    if (extension === '.pdf') return starts([0x25, 0x50, 0x44, 0x46, 0x2d])
    if (extension === '.png') return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (extension === '.jpg' || extension === '.jpeg') return starts([0xff, 0xd8, 0xff])
    if (extension === '.webp')
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)
    return false
  } finally {
    await handle.close()
  }
}

const mimeType = (extension: string): string => {
  const types: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }
  return types[extension] ?? 'application/octet-stream'
}

ipcMain.handle(channels.procurement.getRecords, async () => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.purchaseOrder))
    const [deliveries, invoices, payments, paymentSummaries] = await Promise.all([
      findDeliveries(),
      findInvoices(),
      findPayments(),
      findPaymentSummaries()
    ])
    return { success: true, deliveries, invoices, payments, paymentSummaries }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

interface SelectedInvoiceFile {
  path: string
  accountId: number
  name: string
  size: number
}

// Note: The renderer receives only an opaque token for a file chosen through the native dialog, so
// it can never ask the main process to copy an arbitrary path.
const selectedInvoiceFiles = new Map<string, SelectedInvoiceFile>()

const storedInvoicePath = async (
  id: number
): Promise<{ path: string; originalFilename: string } | { error: string }> => {
  const invoice = await findInvoiceFile(id)
  if (!invoice) return { error: 'Supplier invoice not found.' }
  if (
    basename(invoice.storedFilename) !== invoice.storedFilename ||
    !invoiceExtensions.has(extname(invoice.storedFilename).toLowerCase())
  ) {
    return { error: 'Invalid stored invoice reference.' }
  }
  const path = join(invoiceDirectory(), invoice.storedFilename)
  const details = await stat(path).catch(() => null)
  if (!details?.isFile()) {
    return {
      error:
        'The stored invoice file is missing. Restore it from a backup or upload the invoice document again.'
    }
  }
  return { path, originalFilename: invoice.originalFilename }
}

ipcMain.handle(channels.procurement.chooseInvoiceFile, async (event) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).createAny(resources.purchaseOrder)
    )
    const accountId = state.session?.account.id
    if (!accountId) return { success: false, error: 'Session not found.' }
    const selection = await windowDialog(event).showOpenDialog({
      title: 'Select supplier invoice',
      properties: ['openFile'],
      filters: [{ name: 'Invoice documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (selection.canceled || !selection.filePaths[0]) return { success: true, cancelled: true }
    const source = selection.filePaths[0]
    if (!invoiceExtensions.has(extname(source).toLowerCase())) {
      return { success: false, error: 'Select a PDF, PNG, JPEG, or WebP invoice.' }
    }
    const details = await stat(source)
    if (!details.isFile() || details.size === 0) {
      return { success: false, error: 'The selected invoice file is empty or unreadable.' }
    }
    if (details.size > MAX_INVOICE_BYTES) {
      return { success: false, error: 'The invoice file is larger than 20 MB. Save a smaller scan or PDF.' }
    }
    if (!(await hasInvoiceSignature(source, extname(source).toLowerCase()))) {
      return {
        success: false,
        error: `This file is not a real ${extname(source).slice(1).toUpperCase()} document. Select the original invoice PDF or image.`
      }
    }
    const token = randomUUID()
    // Note: Abandoned selections are discarded oldest-first so the map stays small.
    if (selectedInvoiceFiles.size >= 20)
      selectedInvoiceFiles.delete(selectedInvoiceFiles.keys().next().value!)
    selectedInvoiceFiles.set(token, {
      path: source,
      accountId,
      name: basename(source),
      size: details.size
    })
    return { success: true, file: { token, name: basename(source), size: details.size } }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.procurement.uploadInvoice, async (_, payload: unknown) => {
  let destination = ''
  try {
    authorize((session) =>
      accessControl.can(session.account.role).createAny(resources.purchaseOrder)
    )
    const accountId = state.session?.account.id
    if (!accountId) return { success: false, error: 'Session not found.' }
    const { fileToken, ...data } = supplierInvoiceUploadSchema.parse(payload)
    const file = selectedInvoiceFiles.get(fileToken)
    if (!file || file.accountId !== accountId) {
      return { success: false, error: 'Choose the invoice file again before saving.' }
    }
    const extension = extname(file.path).toLowerCase()
    const storedFilename = `${randomUUID()}${extension}`
    await mkdir(invoiceDirectory(), { recursive: true })
    destination = join(invoiceDirectory(), storedFilename)
    try {
      await copyFile(file.path, destination)
    } catch {
      destination = ''
      return {
        success: false,
        error: 'The selected invoice file can no longer be read. Choose the file again.'
      }
    }
    const details = await stat(destination)
    // Note: The file may have changed since it was chosen, so the copy is checked again.
    if (details.size > MAX_INVOICE_BYTES || !(await hasInvoiceSignature(destination, extension))) {
      await unlink(destination).catch(() => undefined)
      destination = ''
      return { success: false, error: 'The invoice file changed or is not a valid document. Choose it again.' }
    }
    const invoice = await insertInvoice({
      ...data,
      originalFilename: file.name,
      storedFilename,
      mimeType: mimeType(extension),
      fileSize: details.size,
      uploadedBy: accountId
    })
    selectedInvoiceFiles.delete(fileToken)
    state.database.stale = true
    return { success: true, invoice }
  } catch (error) {
    if (destination) await unlink(destination).catch(() => undefined)
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.procurement.openInvoice, async (_, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.purchaseOrder))
    if (!isId(id)) return { success: false, error: 'Invalid supplier invoice.' }
    const file = await storedInvoicePath(id)
    if ('error' in file) return { success: false, error: file.error }
    const error = await shell.openPath(file.path)
    return error
      ? {
          success: false,
          error: `No application could open this invoice (${error}). Use Download to save a copy instead.`
        }
      : { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.procurement.downloadInvoice, async (event, id: unknown) => {
  try {
    authorize((session) => accessControl.can(session.account.role).readAny(resources.purchaseOrder))
    if (!isId(id)) return { success: false, error: 'Invalid supplier invoice.' }
    const file = await storedInvoicePath(id)
    if ('error' in file) return { success: false, error: file.error }
    const extension = extname(file.path).toLowerCase()
    const selection = await windowDialog(event).showSaveDialog({
      title: 'Save supplier invoice',
      defaultPath: file.originalFilename,
      filters: [{ name: 'Invoice document', extensions: [extension.slice(1)] }]
    })
    if (selection.canceled || !selection.filePath) return { success: true, cancelled: true }
    await copyFile(file.path, selection.filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})

ipcMain.handle(channels.procurement.recordPayment, async (_, payload: unknown) => {
  try {
    authorize((session) =>
      accessControl.can(session.account.role).updateAny(resources.purchaseOrder)
    )
    const accountId = state.session?.account.id
    if (!accountId) return { success: false, error: 'Session not found.' }
    const data = supplierPaymentSchema.parse(payload)
    const payment = await insertPayment({
      ...data,
      invoiceId: data.invoiceId ?? null,
      referenceNumber: data.referenceNumber || null,
      notes: data.notes || null,
      recordedBy: accountId
    })
    state.database.stale = true
    return { success: true, payment }
  } catch (error) {
    return { success: false, error: formatValidationError(error) }
  }
})
