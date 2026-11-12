import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * A site's own files (`src/lib`, the image components, the page routes) are copied from the starter and stay the site's.
 * `npm update bearminion` does not touch them. The hosted editor needs a few of them in step with the library, and
 * without them it fails late and quietly: an image uploaded in the editor makes its page answer 500, or the editor draws
 * build-time content. This finds that at build time instead.
 */

export const TEMPLATE_DOCS = 'https://docs.bearminion.com/integration/#keeping-the-sites-files-current'

/** Reads a file, or `undefined` when it is not there. */
function read(file: string): string | undefined {
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined
  } catch {
    return undefined
  }
}

/** What is out of step in the project at `root`, one sentence each. Empty when the site is current, or is not the starter. */
export function staleTemplateProblems(root: string): string[] {
  const problems: string[] = []
  const starterMarker = path.join(root, 'src/components/molecules/MediaFrame.astro')
  if (existsSync(starterMarker) && !existsSync(path.join(root, 'src/lib/editing.ts'))) {
    problems.push(
      'src/lib/editing.ts is missing, so the image components throw for an image uploaded in the editor and the page answers 500 until the next build.',
    )
  }
  const route = read(path.join(root, 'src/pages/[...slug].astro'))
  if (route !== undefined && !route.includes('locals.bearminion')) {
    problems.push(
      'src/pages/[...slug].astro does not read Astro.locals.bearminion, so the editor would show the pages as they were at build time.',
    )
  }
  const notFound = read(path.join(root, 'src/pages/404.astro'))
  if (notFound !== undefined && !notFound.includes('locals.bearminion')) {
    problems.push(
      'src/pages/404.astro does not read Astro.locals.bearminion, so the editor would show the 404 page as it was at build time.',
    )
  }
  return problems
}
