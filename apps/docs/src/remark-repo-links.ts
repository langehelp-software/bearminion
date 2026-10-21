import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

export interface RepoLinksOptions {
  /** Absolute path of the repository root. */
  repoRoot: string
  /** Absolute path of the folder whose Markdown files are the site's pages (`docs/`). */
  docsDir: string
  /** The repository on GitHub, such as `https://github.com/langehelp-software/bearminion`. */
  github: string
  /** The branch GitHub links point at. */
  branch?: string
  /**
   * Collects links to files that do not exist. Astro's content loader logs an error thrown by a Markdown plugin and
   * builds the page without its content, so the plugin records the problem and `checkLinks()` fails the build.
   */
  problems: string[]
}

interface MarkdownNode {
  type: string
  url?: string
  children?: MarkdownNode[]
}

interface MarkdownFile {
  path?: string
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * The pages in `docs/` link to each other and to the rest of the repository the way GitHub shows them
 * (`content.md#content-versions`, `../templates/default/README.md`). On the site, a link to another page becomes its
 * URL (`/content/#content-versions`, `README.md` is `/`), and a link to any other file in the repository opens it on
 * GitHub. A link to a file that does not exist is recorded in `options.problems`.
 */
export function remarkRepoLinks(options: RepoLinksOptions) {
  const branch = options.branch ?? 'main'
  const github = options.github.replace(/\/+$/, '')

  const rewrite = (url: string, from: string): string => {
    if (url === '' || SCHEME.test(url) || url.startsWith('#') || url.startsWith('/')) return url
    const hashIndex = url.indexOf('#')
    const target = hashIndex === -1 ? url : url.slice(0, hashIndex)
    const hash = hashIndex === -1 ? '' : url.slice(hashIndex)
    const absolute = path.resolve(path.dirname(from), decodeURI(target))
    if (!existsSync(absolute)) {
      options.problems.push(`${path.relative(options.repoRoot, from)}: ${url} does not exist`)
      return url
    }

    const inDocs = path.relative(options.docsDir, absolute)
    if (!inDocs.startsWith('..') && !path.isAbsolute(inDocs) && inDocs.endsWith('.md')) {
      const slug = inDocs.slice(0, -'.md'.length).split(path.sep).join('/')
      return `${slug === 'README' ? '/' : `/${slug.replace(/\/README$/, '')}/`}${hash}`
    }

    const inRepo = path.relative(options.repoRoot, absolute)
    if (inRepo.startsWith('..') || path.isAbsolute(inRepo)) {
      options.problems.push(`${path.relative(options.repoRoot, from)}: ${url} is outside the repository`)
      return url
    }
    const kind = statSync(absolute).isDirectory() ? 'tree' : 'blob'
    return `${github}/${kind}/${branch}/${inRepo.split(path.sep).join('/')}${hash}`
  }

  return (tree: MarkdownNode, file: MarkdownFile): void => {
    const from = file.path
    if (!from) return
    const relative = path.relative(options.docsDir, from)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return
    const visit = (node: MarkdownNode) => {
      if ((node.type === 'link' || node.type === 'definition') && typeof node.url === 'string') node.url = rewrite(node.url, from)
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
  }
}
