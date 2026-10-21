import type { Issue } from '../types.js'

/** Validation messages for one field, under its control. */
export function FieldErrors({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null
  return (
    <>
      {issues.map((issue) => (
        <span class="bm-error" key={`${issue.path}:${issue.message}`}>
          {issue.message}
        </span>
      ))}
    </>
  )
}

/** The issues reported for exactly this path. */
export function issuesFor(issues: Issue[], path: string | undefined): Issue[] {
  if (!path) return []
  return issues.filter((issue) => issue.path === path)
}
