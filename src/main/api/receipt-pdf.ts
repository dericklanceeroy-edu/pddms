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

/** Renders an A4 page (count sheet, register) to PDF in a hidden window with scripts disabled. */
export async function a4Pdf(html: string, landscape = false): Promise<Buffer> {
  const renderer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true }
  })
  try {
    await renderer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await renderer.webContents.printToPDF({
      landscape,
      pageSize: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;width:100%;text-align:center;color:#666">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>'
    })
  } finally {
    renderer.destroy()
  }
}
