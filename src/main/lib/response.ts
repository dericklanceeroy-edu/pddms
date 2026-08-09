export type ResponseData<T> = {
  message?: string
  payload?: T
}

export const response = {
  ok<T>(data: ResponseData<T> = {}) {
    return {
      message: data.message ?? 'Ok',
      payload: data.payload,
      success: true
    }
  },

  error<T>(data: ResponseData<T> = {}) {
    return {
      message: data.message ?? 'Error',
      payload: data.payload,
      success: false
    }
  }
}
