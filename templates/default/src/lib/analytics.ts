/** Build-time environment, as `process.env` gives it. */
export type Env = Record<string, string | undefined>

const ON = new Set(['on', '1', 'true', 'yes'])
const OFF = new Set(['off', '0', 'false', 'no'])

function readSwitch(value: string | undefined): boolean | undefined {
  const word = value?.trim().toLowerCase()
  if (word === undefined) return undefined
  if (ON.has(word)) return true
  if (OFF.has(word)) return false
  return undefined
}

/**
 * Whether this build puts `site.analytics` into its pages (`Base.astro` calls it with `process.env` and
 * `import.meta.env.PROD`). Nobody has to set anything:
 *
 * 1. `BEARMINION_ANALYTICS=on|off` decides, when someone sets it (for hosts that cannot be told apart, or a
 *    local test).
 * 2. Otherwise only a production build counts, so `astro dev` sends no visits.
 * 3. Vercel (`VERCEL_ENV`) and Netlify (`NETLIFY`, `CONTEXT`) say which deployment this is, so their preview
 *    deployments send none either.
 * 4. Any other host: every production build counts.
 */
export function analyticsEnabled(env: Env, production: boolean): boolean {
  const override = readSwitch(env.BEARMINION_ANALYTICS)
  if (override !== undefined) return override
  if (!production) return false
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production'
  if (env.NETLIFY === 'true') return env.CONTEXT === 'production'
  return true
}
