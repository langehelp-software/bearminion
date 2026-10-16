import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'

/** `import css from './file.css?raw'`: the file's text, as Vite loads it in the tests. */
const raw = {
  name: 'bearminion:raw',
  resolveId(id: string, importer?: string) {
    if (!id.endsWith('?raw') || !importer) return null
    return `${path.resolve(path.dirname(importer), id.slice(0, -'?raw'.length))}?raw`
  },
  load(id: string) {
    if (!id.endsWith('?raw')) return null
    return `export default ${JSON.stringify(readFileSync(id.slice(0, -'?raw'.length), 'utf8'))}`
  },
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    astro: 'src/astro.ts',
    content: 'src/content.ts',
    'rich-text': 'src/rich-text.ts',
    marks: 'src/marks.ts',
    // The overlay. `editor-client.ts` serves it to the dev server from `dist/ui/mount.js`.
    'ui/mount': 'src/ui/mount.tsx',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  clean: true,
  sourcemap: false,
  deps: {
    neverBundle: [/^node:/],
    // Signals and ProseMirror ship inside `ui/mount.js`, so Vite never meets a new dependency mid-session (its optimizer
    // would reload the page). `preact` stays external, so the overlay and signals share one Preact instance.
    alwaysBundle: [/^@preact\/signals/, /^(?:prosemirror-|orderedmap$|rope-sequence$|w3c-keyname$)/],
  },
  plugins: [raw],
})
