/** A key that is empty, absolute or leaves the content directory. */
export class StoreKeyError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a path inside the content directory.`)
    this.name = 'StoreKeyError'
  }
}

/**
 * A store that could not do what was asked, for a reason the person editing can act on (a refused token, a protected
 * branch, a branch that moved). The editor API answers it with `status` and `code`, so the message reaches the page
 * instead of becoming a bare 500.
 */
export class StoreError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'StoreError'
    this.status = status
    this.code = code
  }
}
