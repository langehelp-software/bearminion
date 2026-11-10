// Tries githubStore against a real repository.
//   GITHUB_TOKEN=... node scripts/try-github-store.mjs owner/repo [branch]
// WARNING: this commits to the branch (a temp file under content/, a 1x1 PNG under src/assets/uploads) and removes
// them again. Use a throwaway repository.
import { githubStore } from '../packages/editor/dist/astro.js'

const [repo, branch] = process.argv.slice(2)
const token = process.env.GITHUB_TOKEN
if (!repo || !token) {
  console.error('Usage: GITHUB_TOKEN=... node scripts/try-github-store.mjs owner/repo [branch]')
  process.exit(1)
}

const store = githubStore({ repo, token, branch })
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
)

console.log('pages:', await store.list('pages'))
console.log('site.json:', (await store.read('site.json'))?.slice(0, 60) ?? 'missing')

const key = `bearminion-try-${Date.now()}.json`
await store.apply([{ type: 'write', key, text: '{"zażółć":true}\n' }])
console.log('wrote and read back:', await store.read(key))
await store.apply([{ type: 'remove', key }])
console.log('removed, exists now:', await store.exists(key))

const saved = await store.uploads.save({ originalName: 'try.png', bytes: PNG, kind: 'png' })
console.log(
  'uploaded:',
  saved.path,
  'listed:',
  (await store.uploads.list()).some((i) => i.filename === saved.filename),
)
console.log('asset exists:', await store.assetExists?.(saved.path))
console.log('removed upload:', await store.uploads.remove(saved.filename))
