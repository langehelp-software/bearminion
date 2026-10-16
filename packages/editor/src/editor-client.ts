import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:bearminion-editor'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * Serves the editor overlay only while Vite is in serve mode.
 * `astro build` never adds this plugin, so the client is absent from production.
 */
export function editorClientPlugin(): Plugin {
  // The published package ships `ui/mount.js`; the monorepo's own tests run the sources, which have `mount.tsx`.
  const entry = ['./ui/mount.js', './ui/mount.tsx']
    .map((file) => fileURLToPath(new URL(file, import.meta.url)))
    .find((file) => fs.existsSync(file))
  if (!entry) throw new Error('bearminion: the editor client (ui/mount) was not found.')
  return {
    name: 'bearminion-editor-client',
    apply: 'serve',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      return `import { mountEditor } from ${JSON.stringify(entry)};\nmountEditor();\n`
    },
  }
}
