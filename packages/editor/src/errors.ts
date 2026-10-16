/** One schema problem, addressed by a dot path such as `sections.0.props.heading`. */
export interface ContentIssue {
  path: PropertyKey[]
  message: string
}

export function formatContentIssues(issues: readonly ContentIssue[]): string {
  return issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
      return `  - ${where}: ${issue.message}`
    })
    .join('\n')
}

/** Base error for content that cannot be loaded. `filePath` is the file or directory involved. */
export class ContentError extends Error {
  readonly filePath: string

  constructor(filePath: string, message: string) {
    super(message)
    this.name = new.target.name
    this.filePath = filePath
  }
}

/** `site.json` or a page file failed schema validation. */
export class ContentValidationError extends ContentError {
  readonly issues: readonly ContentIssue[]

  constructor(filePath: string, issues: readonly ContentIssue[]) {
    super(filePath, `Invalid content in ${filePath}:\n${formatContentIssues(issues)}`)
    this.issues = issues
  }
}

/** A content file or directory is missing, unreadable, or not valid JSON. */
export class ContentReadError extends ContentError {}
