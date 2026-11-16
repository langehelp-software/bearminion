// Builds the live section previews the docs show: every section of templates/default in every layout, one page each,
// with its default content. The template's own build stays as it is: this adds the preview route to a separate build
// with the base path /previews, then copies only the previews and their assets into public/previews.
//
//   node scripts/build-previews.mjs
import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const template = path.resolve(docs, '../../templates/default')
const target = path.join(docs, 'public/previews')
/** Where a preview is served, under the base path: /previews/section/<section>/<variant>/, as text-image/right. */
const ROUTE = 'section'

if (!existsSync(path.resolve(docs, '../../packages/editor/dist/index.js'))) {
  throw new Error('Build bearminion first (pnpm build:lib): the previews are a build of the template, which needs it.')
}

// The template resolves `astro` from its own node_modules: load it from there, so its config and this build agree.
const { build } = await import(pathToFileURL(path.join(template, 'node_modules/astro/dist/index.js')).href)

// Inside the repository, not the system temp folder: Astro moves files from the template's .astro folder into the
// build with a rename, which fails across file systems (on Vercel, /tmp is another one).
const outDir = path.join(docs, 'node_modules/.cache/bearminion-previews')
rmSync(outDir, { recursive: true, force: true })
const previews = {
  name: 'bearminion-docs:previews',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({ pattern: `/${ROUTE}/[section]/[variant]`, entrypoint: path.join(template, 'src/dev/section-preview.astro') })
    },
  },
}

// The template reads its content folder from the working directory, as `astro build` run there would.
process.chdir(template)
try {
  await build({ root: template, base: '/previews', outDir, logLevel: 'warn', integrations: [previews] })
  rmSync(target, { recursive: true, force: true })
  // Only the previews and the files they load. The template's own pages are not part of the docs.
  cpSync(path.join(outDir, ROUTE), path.join(target, ROUTE), { recursive: true })
  cpSync(path.join(outDir, '_astro'), path.join(target, '_astro'), { recursive: true })
  console.log(`previews: ${path.relative(docs, target)}`)
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
