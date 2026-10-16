import path from 'node:path'

/** The content directory: `content/` next to package.json, or `BEARMINION_CONTENT_DIR` when it is set. */
export function contentDirectory(): string {
  const override = process.env.BEARMINION_CONTENT_DIR
  if (override) return path.resolve(override)
  return path.join(process.cwd(), 'content')
}
