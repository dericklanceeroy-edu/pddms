import { BrowserWindow } from 'electron'

/** Renders an 80 mm receipt page to PDF in a hidden window with scripts disabled. */
export async function receiptPdf(html: string): Promise<Buffer> {
  const renderer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
  })
  try {
    await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Note: 80 mm paper; the page is tall enough for long orders and the printer trims the rest.
    return await renderer.webContents.printToPDF({
      pageSize: { width: 3.15, height: 11.69 },
      margins: { marginType: 'none' },
      printBackground: true
    })
  } finally {
    renderer.destroy()
  }
}
