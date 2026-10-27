// `prepack` of both packages. `pnpm release` builds them once, in order (bearminion first, because create-bearminion's
// build reads its registry tool), and sets BEARMINION_PREBUILT. `changeset publish` packs both packages at the same time:
// rebuilding here would let bearminion's build empty its dist while create-bearminion's build is reading it.
// A plain `npm pack` or `npm publish` of one package still builds it.
import { execFileSync } from 'node:child_process'

if (process.env.BEARMINION_PREBUILT === '1') process.exit(0)
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })
