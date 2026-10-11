import {
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue
} from 'electron'

interface WindowDialog {
  showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>
  showMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>
}

/**
 * Native dialogs attached to the window that requested them.
 *
 * Note: IPC handlers run one at a time (see `ipc.ts`). A parentless dialog can open behind the
 * application window, which leaves every later request (saving, payments, sign-in) waiting until
 * the hidden dialog is found and closed. Attaching the dialog to its window keeps it modal and
 * visible above the application.
 */
export function windowDialog(event: Pick<IpcMainInvokeEvent, 'sender'> | undefined): WindowDialog {
  const owner = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null
  return {
    showOpenDialog: (options) =>
      owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options),
    showSaveDialog: (options) =>
      owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options),
    showMessageBox: (options) =>
      owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options)
  }
}
