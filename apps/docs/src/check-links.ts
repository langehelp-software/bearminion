import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

const HREF = /\shref="([^"]*)"/g
const ID = /\sid="([^"]*)"/g

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return htmlFiles(full)
    return full.endsWith('.html') ? [full] : []
  })
}

/** The built file a site path is served from, or undefined when the build has none. */
function resolveTarget(dist: string, pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname)
  const candidates = decoded.endsWith('/')
    ? [path.join(dist, decoded, 'index.html')]
    : [path.join(dist, decoded), path.join(dist, `${decoded}.html`), path.join(dist, decoded, 'index.html')]
  return candidates.find((file) => existsSync(file) && statSync(file).isFile())
}

/**
 * Fails the build when a page links to a path the site does not have, to an anchor that the target page does not
 * define, or (through `options.problems`, from `remarkRepoLinks`) to a repository file that does not exist. It reads
 * the built HTML, so it sees the URLs and heading ids exactly as visitors get them. External links are not checked.
 */
export function checkLinks(options: { problems: readonly string[] }): AstroIntegration {
  return {
    name: 'bearminion-docs:check-links',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const dist = fileURLToPath(dir)
        const ids = new Map<string, Set<string>>()
        const idsOf = (file: string) => {
          let set = ids.get(file)
          if (!set) {
            set = new Set([...readFileSync(file, 'utf8').matchAll(ID)].map((match) => match[1] ?? ''))
            ids.set(file, set)
          }
          return set
        }

        const problems = [...options.problems]
        for (const page of htmlFiles(dist)) {
          const html = readFileSync(page, 'utf8')
          const from = `/${path.relative(dist, page).split(path.sep).join('/')}`
          for (const [, href = ''] of html.matchAll(HREF)) {
            if (href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue
            const url = new URL(href.replaceAll('&amp;', '&'), `https://site${from}`)
            const target = url.pathname === new URL(`https://site${from}`).pathname ? page : resolveTarget(dist, url.pathname)
            if (!target) {
              problems.push(`${from}: ${href} does not exist`)
              continue
            }
            const hash = decodeURIComponent(url.hash.slice(1))
            if (hash && hash !== '_top' && target.endsWith('.html') && !idsOf(target).has(hash)) {
              problems.push(`${from}: ${href} has no #${hash} on that page`)
            }
          }
        }

        if (problems.length > 0) {
          throw new Error(`Broken links in the docs:\n${[...new Set(problems)].map((line) => `  ${line}`).join('\n')}`)
        }
        logger.info(`Checked the links on ${htmlFiles(dist).length} pages.`)
      },
    },
  }
}
