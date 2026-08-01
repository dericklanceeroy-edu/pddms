export const DEFAULT_OK_CODE = 0
export const DEFAULT_ERROR_CODE = 1

export type ResponseData<T> = {
  message?: string
  payload?: T
}

export interface Response<T = null> {
  code: typeof DEFAULT_OK_CODE | typeof DEFAULT_ERROR_CODE
  message: string
  payload: T | null
}

export const response = {
  ok<T = null>(data: ResponseData<T> = {}): Response<T> {
    return {
      code: DEFAULT_OK_CODE,
      message: data.message ?? 'Ok',
      payload: data.payload ?? null
    }
  },

  error<T = null>(data: ResponseData<T> = {}): Response<T> {
    return {
      code: DEFAULT_ERROR_CODE,
      message: data.message ?? 'Error',
      payload: data.payload ?? null
    }
  }
}
