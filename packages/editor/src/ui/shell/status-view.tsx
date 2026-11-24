import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { SectionState, SiteStatus, StatusSection } from '../../api-types.js'
import { isNewerVersion } from '../../site-status.js'
import { getSiteStatus, latestVersion } from '../api-client.js'
import { Icon } from '../icons.js'

/**
 * How a section that is not plainly up to date is shown. `attention` rows go first, carry a note with a command, and
 * count in the summary. `edited` (you changed it, the release has nothing newer) and `custom` (not in the release) are
 * marked, but there is nothing to do about them.
 */
const FLAGS: Partial<
  Record<SectionState, { label: string; tone: 'amber' | 'grey'; attention: boolean; note?: string; command?: (dir: string) => string }>
> = {
  update: {
    label: 'Out of date',
    tone: 'amber',
    attention: true,
    note: 'A newer version ships with this release.',
    command: (dir) => `npx bearminion@latest add ${dir}`,
  },
  conflict: {
    label: 'Changed',
    tone: 'grey',
    attention: true,
    note: 'Edited in this project, and this release changed it too. Updating would replace your edits, so the file is left alone. See the difference first.',
    command: (dir) => `npx bearminion add ${dir} --diff`,
  },
  edited: { label: 'Changed', tone: 'grey', attention: false },
  custom: { label: 'Your own', tone: 'grey', attention: false },
}

/** What else `bearminion add` brings, beyond sections. Listed, not detected: the editor cannot tell reliably. */
const ADD_ONS = [
  {
    label: 'Hosted editor',
    description: 'Edit online, with GitHub sign-in. Writes the editor build and installs the Vercel adapter.',
    command: 'npx bearminion add hosted --install',
  },
  { label: 'Blog', description: 'A ready blog content type with a listing page.', command: 'npx bearminion add blog' },
  { label: 'Content type', description: 'A type of your own: news, case studies, team members.', command: 'npx bearminion add type' },
  { label: 'Form handler', description: 'Where the Contact form sends its messages.', command: 'npx bearminion add form --list' },
] as const

const needsAttention = (section: StatusSection): boolean => (section.state ? (FLAGS[section.state]?.attention ?? false) : false)

/** A command with a Copy button. `tone` picks the chip: grey on white, white on a tinted note, or full width. */
function Command({ command, tone = 'fill' }: { command: string; tone?: 'fill' | 'outline' | 'block' }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <span class={`bm-command bm-command-${tone}`}>
      <code>{command}</code>
      <button
        type="button"
        class="bm-command-copy"
        aria-label={copied ? 'Copied' : `Copy ${command}`}
        title={copied ? 'Copied' : 'Copy'}
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </span>
  )
}

function GroupHead({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="bm-status-group-head">
      <h2 class="bm-status-group-title">{title}</h2>
      {children}
    </div>
  )
}

function InstalledRow({ section }: { section: StatusSection }) {
  const flag = section.state ? FLAGS[section.state] : undefined
  return (
    <li class="bm-status-row">
      <span class="bm-status-name">{section.label}</span>
      <span class="bm-status-desc" title={section.description}>
        {section.description}
      </span>
      <span class="bm-status-end">
        {flag && <span class={`bm-status-flag bm-status-flag-${flag.tone}`}>{flag.label}</span>}
        <code class="bm-status-key">{section.dir}</code>
      </span>
      {flag?.note && flag.command && (
        <div class={`bm-status-note bm-status-note-${flag.tone}`}>
          <span>{flag.note}</span>
          <Command command={flag.command(section.dir)} tone="outline" />
        </div>
      )}
    </li>
  )
}

/** The newest release on npm, once asked: undefined while asking, null when npm could not be reached. */
function useLatest(): string | null | undefined {
  const [latest, setLatest] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void latestVersion().then((value) => {
      if (live) setLatest(value)
    })
    return () => {
      live = false
    }
  }, [])
  return latest
}

function StatusCard({ status, installed, missing }: { status: SiteStatus; installed: StatusSection[]; missing: number }) {
  const latest = useLatest()
  const newer = latest && isNewerVersion(latest, status.version) ? latest : null
  const attention = installed.filter(needsAttention).length
  const hosted = status.mode === 'hosted'
  const tone = hosted ? 'grey' : attention > 0 ? 'amber' : 'green'
  const line = hosted
    ? `${installed.length} ${installed.length === 1 ? 'section' : 'sections'} installed`
    : attention > 0
      ? `${attention} of ${installed.length} sections need attention${missing > 0 ? ` · ${missing} not installed` : ''}`
      : `All ${installed.length} sections up to date`
  return (
    <section class="bm-status-card" aria-label="Status">
      <div class="bm-status-running">
        <span class="bm-status-group-title">Running</span>
        <span class="bm-status-version">
          bearminion <code>{status.version}</code>
        </span>
        {latest === undefined ? (
          <span class="bm-status-flag bm-status-flag-grey">Checking npm…</span>
        ) : latest === null ? (
          <span class="bm-status-flag bm-status-flag-grey" title="npm could not be reached">
            Latest release unknown
          </span>
        ) : newer ? (
          <span class="bm-status-flag bm-status-flag-amber">Update available · {newer}</span>
        ) : (
          <span class="bm-status-flag bm-status-flag-green">Latest release</span>
        )}
      </div>
      <div class="bm-status-summary">
        <div class="bm-status-line">
          <span class={`bm-status-icon bm-status-icon-${tone}`} aria-hidden="true">
            {tone === 'amber' ? '!' : tone === 'green' ? '✓' : 'i'}
          </span>
          <span>{line}</span>
        </div>
        {newer && (
          <div class="bm-status-step">
            <span>Update the library first, then compare the site with the new release.</span>
            <Command command="npm install bearminion@latest" />
          </div>
        )}
        <div class="bm-status-step">
          <span>
            {hosted
              ? 'The online editor cannot compare the site’s files with the release. Run this in the project to see what is out of date or changed.'
              : 'Compare the site with the release. Lists every section file that is out of date or changed, without writing anything.'}
          </span>
          <Command command={newer ? 'npx bearminion@latest status' : 'npx bearminion status'} />
        </div>
      </div>
    </section>
  )
}

/** Site status, for the developer: the version, the installed sections and what can be added, with commands to copy. */
export function StatusView() {
  const [status, setStatus] = useState<SiteStatus | null | 'failed'>(null)
  useEffect(() => {
    let live = true
    void getSiteStatus().then((result) => {
      if (live) setStatus(result.ok ? result.value : 'failed')
    })
    return () => {
      live = false
    }
  }, [])

  const ready = status && status !== 'failed' ? status : null
  // Sections that need attention first, then by name.
  const installed = (ready?.sections ?? [])
    .filter((section) => section.installed)
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.label.localeCompare(b.label))
  const missing = (ready?.sections ?? []).filter((section) => !section.installed)
  const attention = installed.filter(needsAttention).length

  return (
    <div class="bm-listing bm-history bm-status">
      <header class="bm-listing-head">
        <div class="bm-listing-heading">
          <div class="bm-listing-title-row">
            <h1 class="bm-screen-title">Site status</h1>
          </div>
          <p class="bm-history-sub">
            For your developer: what this site runs and what can be added. Run the commands in the project folder.
          </p>
        </div>
      </header>
      {status === null && <p class="bm-note">Loading…</p>}
      {status === 'failed' && <p class="bm-note">Could not load the site status.</p>}
      {ready && (
        <div class="bm-status-body">
          <div class="bm-status-main">
            <StatusCard status={ready} installed={installed} missing={missing.length} />

            <div class="bm-status-group">
              <GroupHead title="Installed sections">
                <span
                  class={`bm-status-flag ${
                    ready.mode === 'hosted' ? 'bm-status-flag-grey' : attention > 0 ? 'bm-status-flag-amber' : 'bm-status-flag-green'
                  }`}
                >
                  {ready.mode === 'hosted'
                    ? installed.length
                    : attention > 0
                      ? `${installed.length} · ${attention} need${attention === 1 ? 's' : ''} attention`
                      : `${installed.length} · all up to date`}
                </span>
              </GroupHead>
              <ul class="bm-status-list">
                {installed.map((section) => (
                  <InstalledRow key={section.type} section={section} />
                ))}
              </ul>
            </div>

            {missing.length > 0 && (
              <div class="bm-status-group">
                <GroupHead title="Not installed">
                  <span class="bm-status-hint">In this release, not in this site yet</span>
                </GroupHead>
                <ul class="bm-status-list bm-status-list-missing">
                  {missing.map((section) => (
                    <li key={section.type} class="bm-status-row">
                      <span class="bm-status-name">{section.label}</span>
                      <span class="bm-status-desc" title={section.description}>
                        {section.description}
                      </span>
                      <span class="bm-status-end">
                        <Command command={`npx bearminion add ${section.dir}`} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside class="bm-status-group bm-status-side" aria-label="More to add">
            <GroupHead title="More to add" />
            {ADD_ONS.map((item) => (
              <div key={item.label} class="bm-status-addon">
                <div class="bm-status-addon-text">
                  <span class="bm-status-name">{item.label}</span>
                  <span class="bm-status-addon-desc">{item.description}</span>
                </div>
                <Command command={item.command} tone="block" />
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  )
}
