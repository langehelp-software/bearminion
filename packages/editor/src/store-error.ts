/** A key that is empty, has an empty or dot segment, or leaves its base directory. */
export class StoreKeyError extends Error {
  constructor(key: string) {
    super(`"${key}" is not a valid store path.`)
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
