// Tries githubStore against a real repository.
//   GITHUB_TOKEN=... node scripts/try-github-store.mjs owner/repo [branch] [--pr]
// WARNING: this commits to the repository and removes it again. Use a throwaway repository.
//   Direct mode: a temp file under content/ and a 1x1 PNG under src/assets/uploads, both added and removed on the branch.
//   --pr: opens a pull request from a bearminion/ branch, then closes it and deletes the branch. The base is untouched.
// Needs `pnpm build:lib` first.
import { githubStore } from '../packages/editor/dist/astro.js'

const args = process.argv.slice(2)
const pr = args.includes('--pr')
const [repo, branch] = args.filter((arg) => !arg.startsWith('--'))
const token = process.env.GITHUB_TOKEN
if (!repo || !token) {
  console.error('Usage: GITHUB_TOKEN=... node scripts/try-github-store.mjs owner/repo [branch] [--pr]')
  process.exit(1)
}

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) =>
  c.charCodeAt(0),
)

async function github(method, route, body) {
  const response = await fetch(`https://api.github.com/repos/${repo}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'bearminion-try' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return response.status === 204 ? null : response.json()
}

if (pr) {
  const store = githubStore({ repo, token, branch, mode: 'pr' })
  const scope = `page:try-${Date.now()}`
  const entry = store.scoped(scope)
  const key = `pages/bearminion-try.json`
  console.log('base sees the file before:', await store.exists(key))
  await entry.apply([{ type: 'write', key, text: '{"zażółć":1}\n' }])
  await entry.apply([{ type: 'write', key, text: '{"zażółć":2}\n' }])
  console.log('entry reads its pending edit:', (await entry.read(key))?.trim())
  console.log('base still does not have it:', !(await store.exists(key)))
  const name = `bearminion/${scope.replace(/[^a-z0-9]+/g, '-')}`
  const pulls = await github('GET', `/pulls?head=${repo.split('/')[0]}:${name}&state=open`)
  console.log(
    'open pull requests for the branch (expect 1):',
    pulls.length,
    pulls[0]?.title,
    pulls[0]?.labels?.map((l) => l.name),
  )
  console.log('Check the pull request on GitHub, then press Enter to close it and delete the branch.')
  await new Promise((resolve) => process.stdin.once('data', resolve))
  for (const pull of pulls) await github('PATCH', `/pulls/${pull.number}`, { state: 'closed' })
  await github('DELETE', `/git/refs/heads/${name}`)
  console.log('closed and deleted')
  process.exit(0)
}

const store = githubStore({ repo, token, branch })
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
