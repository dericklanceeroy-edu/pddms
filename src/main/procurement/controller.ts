import { accessControl, authorize } from '@main/access-control'
import { state } from '@main/api'
import { channels, resources } from '@shared/constants'
import { supplierInvoiceUploadSchema, supplierPaymentSchema } from '@shared/schemas'
import { formatValidationError } from '@shared/validation'
import { isId } from '@shared/validators'
import { app, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat, unlink } from 'node:fs/promises'
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

ipcMain.handle(channels.procurement.uploadInvoice, async (_, payload: unknown) => {
  let destination = ''
  try {
    authorize((session) =>
      accessControl.can(session.account.role).createAny(resources.purchaseOrder)
    )
    const accountId = state.session?.account.id
    if (!accountId) return { success: false, error: 'Session not found.' }
    const data = supplierInvoiceUploadSchema.parse(payload)
    const selection = await dialog.showOpenDialog({
      title: 'Select supplier invoice',
      properties: ['openFile'],
      filters: [{ name: 'Invoice documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (selection.canceled || !selection.filePaths[0]) return { success: true, cancelled: true }

    const source = selection.filePaths[0]
    const extension = extname(source).toLowerCase()
    if (!invoiceExtensions.has(extension)) {
      return { success: false, error: 'Select a PDF, PNG, JPEG, or WebP invoice.' }
    }
    const storedFilename = `${randomUUID()}${extension}`
    await mkdir(invoiceDirectory(), { recursive: true })
    destination = join(invoiceDirectory(), storedFilename)
    await copyFile(source, destination)
    const details = await stat(destination)
    const invoice = await insertInvoice({
      ...data,
      originalFilename: basename(source),
      storedFilename,
      mimeType: mimeType(extension),
      fileSize: details.size,
      uploadedBy: accountId
    })
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
    const invoice = await findInvoiceFile(id)
    if (!invoice) return { success: false, error: 'Supplier invoice not found.' }
    if (basename(invoice.storedFilename) !== invoice.storedFilename) {
      return { success: false, error: 'Invalid stored invoice reference.' }
    }
    const error = await shell.openPath(join(invoiceDirectory(), invoice.storedFilename))
    return error ? { success: false, error } : { success: true }
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
