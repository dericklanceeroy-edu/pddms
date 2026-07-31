import http from 'node:http'

const DEFAULT_OK_CODE = 200
const DEFAULT_ERROR_CODE = 500

type ResponseData<T> = {
  code?: number
  message?: string
  payload?: T
}

export const response = {
  ok<T = unknown>(data: ResponseData<T> = {}) {
    const code = data.code ?? DEFAULT_OK_CODE

    return {
      code,
      message: data.message ?? http.STATUS_CODES[code] ?? 'OK',
      payload: data.payload ?? null
    }
  },

  error<T = unknown>(data: ResponseData<T> = {}) {
    const code = data.code ?? DEFAULT_ERROR_CODE

    return {
      code,
      message: data.message ?? http.STATUS_CODES[code] ?? 'Internal Server Error',
      payload: data.payload ?? null
    }
  }
}
