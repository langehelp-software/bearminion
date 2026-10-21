// Fails when bearminion.com built without styles the template's own build has.
//
//   node scripts/check-styles.mjs      after `pnpm build` (the template) and `pnpm web:build`
//
// The copied template code here is gitignored, and Tailwind skips gitignored files unless a stylesheet names them in
// `@source` (see sync-template.mjs). If those lines go missing the site still builds, with most classes absent: that
// happened once and nobody noticed until the page looked broken. So every class the template's CSS has must be in
// this site's CSS too, unless no copied file here uses it (classes that only Storybook stories use, for example).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Undoes CSS escapes in a class name: `md\:grid-cols-2` → `md:grid-cols-2`, `\32 xl` → `2xl`. */
export function unescapeClass(name) {
  return name.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_match, hex, char) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : char,
  )
}

/** Every class name a stylesheet's selectors mention. Numbers such as `.5rem` in values are not class names. */
export function classesInCss(css) {
  const found = new Set()
  const withoutStrings = css.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""')
  for (const match of withoutStrings.matchAll(
    /(?<![\w\\)\]])\.(-?(?:[A-Za-z_]|\\[0-9a-fA-F]{1,6}\s?|\\.)(?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])*)/g,
  )) {
    found.add(unescapeClass(match[1]))
  }
  return found
}

/** Whether `name` appears in `text` as a whole class token, the way Tailwind reads class names out of source files. */
export function usesClass(text, name) {
  let from = 0
  for (;;) {
    const index = text.indexOf(name, from)
    if (index === -1) return false
    const before = index === 0 ? ' ' : text[index - 1]
    const after = text[index + name.length] ?? ' '
    if (/[\s"'`{},;]/.test(before) && /[\s"'`{},;]/.test(after)) return true
    from = index + 1
  }
}

/** Classes the template's CSS has, the site's CSS lacks, and the site's own source still uses. */
export function missingClasses(templateCss, siteCss, sources) {
  const site = classesInCss(siteCss)
  const missing = []
  for (const name of classesInCss(templateCss)) {
    if (site.has(name)) continue
    const file = sources.find((source) => usesClass(source.text, name))
    if (file) missing.push({ name, file: file.path })
  }
  return missing.sort((a, b) => a.name.localeCompare(b.name))
}

function readCss(dist) {
  const dir = path.join(dist, '_astro')
  if (!existsSync(dir)) throw new Error(`No build in ${dist}: build it first.`)
  return readdirSync(dir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(path.join(dir, name), 'utf8'))
    .join('\n')
}

/** The site's copied code: everything under src/ except its images and its stylesheets, which Tailwind does not scan for class names. */
function readSources(src) {
  const sources = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name)
      if (statSync(file).isDirectory()) {
        if (path.relative(src, file) !== 'assets') walk(file)
      } else if (/\.(astro|ts|tsx|js|mjs|md|mdx)$/.test(name)) {
        sources.push({ path: path.relative(path.dirname(src), file), text: readFileSync(file, 'utf8') })
      }
    }
  }
  walk(src)
  return sources
}

function main() {
  const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const template = path.resolve(site, '../../templates/default')
  const templateCss = readCss(path.join(template, 'dist'))
  const siteCss = readCss(path.join(site, 'dist'))
  const missing = missingClasses(templateCss, siteCss, readSources(path.join(site, 'src')))
  if (missing.length > 0) {
    const list = missing
      .slice(0, 40)
      .map(({ name, file }) => `  ${name}  (used in ${file})`)
      .join('\n')
    const more = missing.length > 40 ? `\n  … and ${missing.length - 40} more` : ''
    console.error(
      `apps/web built without ${missing.length} class(es) the template's build has:\n${list}${more}\n` +
        'Tailwind probably skipped the copied (gitignored) files: check the @source lines sync-template.mjs adds to the stylesheet.',
    )
    process.exit(1)
  }
  console.log(`apps/web has every template class its code uses (${classesInCss(siteCss).size} classes in its CSS).`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
