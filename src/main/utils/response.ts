export const response = {
  ok: <T = any>(data?: { code?: number; message?: string; payload?: T }) => {
    return {
      code: 200,
      message: 'Ok',
      payload: null,
      ...data
    }
  },
  error: <T = any>(data?: { code?: number; message?: string; payload?: T }) => {
    return {
      code: 500,
      message: 'Internal Server Error',
      payload: null,
      ...data
    }
  }
}
