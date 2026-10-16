import { Fragment, type ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Info } from './info.js'
import {
  DEFAULT_BRAND,
  HEX_COLOR,
  contrastChecks,
  derivePalette,
  hasOverrides,
  hasThemeColors,
  tokenToHex,
  OVERRIDE_TOKENS,
  type OverrideToken,
  type ThemeColors,
  type Token,
  type ToneName,
} from '../theme-colors.js'

type Seed = 'brand' | 'neutral' | 'link'
type Mode = 'light' | 'dark'

const TOKEN_LABEL: Record<OverrideToken, string> = {
  bg: 'Background',
  fg: 'Text',
  muted: 'Muted text',
  surface: 'Surface',
  accent: 'Accent',
  on: 'Text on accent',
  link: 'Link',
}

const SEEDS: { key: Seed; label: string; hint: string; fallback: string }[] = [
  {
    key: 'brand',
    label: 'Brand',
    hint: 'Buttons, highlights and the brand-colored sections.',
    fallback: tokenToHex(DEFAULT_BRAND),
  },
  {
    key: 'neutral',
    label: 'Neutral',
    hint: 'Tints backgrounds, text and borders. Grey keeps them neutral.',
    fallback: tokenToHex({ l: 0.5, c: 0.012, h: 255 }),
  },
  {
    key: 'link',
    label: 'Link',
    hint: 'Follows the brand color, adjusted to stay readable, until you pick one.',
    fallback: '',
  },
]

const TONES: { id: ToneName; label: string }[] = [
  { id: 'base', label: 'Base' },
  { id: 'subtle', label: 'Subtle' },
  { id: 'inverse', label: 'Inverse' },
  { id: 'brand', label: 'Brand' },
]

const css = (token: Token): string => `oklch(${token.l} ${token.c} ${token.h}${token.a === undefined ? '' : ` / ${token.a}`})`

function normalizeHex(input: string): string | null {
  const value = input.trim().startsWith('#') ? input.trim() : `#${input.trim()}`
  return HEX_COLOR.test(value) ? value.toLowerCase() : null
}

/** Native picker plus a hex field. The hex field keeps partial input until it is a full color. */
function ColorRow({
  label,
  hint,
  value,
  fallback,
  unsetTag,
  row,
  onChange,
}: {
  label: string
  hint: string
  value: string | undefined
  /** Color shown while nothing is picked: what the site actually uses. */
  fallback: string
  /** Small tag beside the label while nothing is picked, for example "auto". */
  unsetTag?: string
  /** One line inside a bordered list (label, swatch, hex) instead of a stacked field. */
  row?: boolean
  onChange: (next: string | undefined) => void
}) {
  const shown = value ?? fallback
  const [typed, setTyped] = useState(shown)
  useEffect(() => setTyped(shown), [shown])
  const invalid = typed !== shown && normalizeHex(typed) === null
  const picker = (
    <input
      type="color"
      class="bm-colorpick"
      aria-label={`${label} color`}
      value={shown}
      onInput={(event) => onChange(event.currentTarget.value.toLowerCase())}
    />
  )
  const hex = (
    <input
      class="bm-colorhex"
      aria-label={`${label} hex`}
      aria-invalid={invalid}
      spellcheck={false}
      maxLength={7}
      value={typed}
      onInput={(event) => {
        const text = event.currentTarget.value
        setTyped(text)
        const next = normalizeHex(text)
        if (next) onChange(next)
      }}
      onBlur={() => setTyped(shown)}
    />
  )
  const reset = value !== undefined && (
    <button type="button" class="bm-tertiary" aria-label={`Reset ${label.toLowerCase()} color`} onClick={() => onChange(undefined)}>
      Reset
    </button>
  )
  if (row) {
    return (
      <div class="bm-override-row">
        <span class="bm-override-label">
          {label}
          {value === undefined && unsetTag && <span class="bm-meta-tag">{unsetTag}</span>}
        </span>
        {picker}
        {hex}
        {reset}
      </div>
    )
  }
  return (
    <div class="bm-field">
      <span class="bm-label-row bm-label">
        <span class="bm-label-text">
          {label}
          {hint && <Info text={hint} label={`About ${label.toLowerCase()} color`} />}
        </span>
        {value === undefined && unsetTag && <span class="bm-meta-tag">{unsetTag}</span>}
      </span>
      <div class="bm-colorrow">
        {picker}
        {hex}
        {reset}
      </div>
    </div>
  )
}

function Cell({
  editable,
  pressed,
  label,
  onPick,
  style,
  children,
}: {
  editable: boolean
  pressed: boolean
  label: string
  onPick: () => void
  style: string
  children: ComponentChildren
}) {
  if (!editable) {
    return (
      <div class="bm-tone-cell" role="img" aria-label={label} style={style}>
        {children}
      </div>
    )
  }
  return (
    <button type="button" class="bm-tone-cell bm-tone-pick" aria-pressed={pressed} aria-label={label} onClick={onPick} style={style}>
      {children}
    </button>
  )
}

/** Tones down, light and dark across. Brand keeps its colors in both modes. */
function ToneMatrix({
  colors,
  mode: editing,
  tone: editingTone,
  onPick,
  editable,
}: {
  colors: ThemeColors | undefined
  mode: Mode
  tone: ToneName
  /** Cells select the tone to edit only while overrides are on. */
  editable: boolean
  onPick: (mode: Mode, tone: ToneName) => void
}) {
  const light = derivePalette(colors, 'light')
  const dark = derivePalette(colors, 'dark')
  const cell = (palette: typeof light, tone: ToneName, mode: string) => {
    const t = palette[tone]
    return (
      <Cell
        editable={editable}
        pressed={editing === mode && editingTone === tone}
        label={editable ? `Edit ${tone} tone, ${mode} mode` : `${tone} tone, ${mode} mode`}
        onPick={() => onPick(mode as Mode, tone)}
        style={`background:${css(t.bg)};color:${css(t.fg)};box-shadow:inset 0 0 0 1px ${css(t.line)};`}
      >
        <span class="bm-tone-aa">Aa</span>
        <span class="bm-tone-muted" style={`color:${css(t.muted)};`}>
          muted
        </span>
        <span class="bm-tone-chip" style={`background:${css(t.accent)};color:${css(t.on)};`}>
          Btn
        </span>
        <span class="bm-tone-link" style={`color:${css(t.link)};`}>
          link
        </span>
      </Cell>
    )
  }
  return (
    <div class="bm-tone-matrix">
      <span class="bm-tone-head" aria-hidden="true" />
      <span class="bm-tone-head">Light</span>
      <span class="bm-tone-head">Dark</span>
      {TONES.map((tone) => (
        <Fragment key={tone.id}>
          <span class="bm-tone-name">{tone.label}</span>
          {cell(light, tone.id, 'light')}
          {cell(dark, tone.id, 'dark')}
        </Fragment>
      ))}
    </div>
  )
}

/** Every token of one mode and tone. A picked value replaces the derived one; Reset returns to it. */
function TonesEditor({
  colors,
  mode,
  tone,
  onMode,
  onTone,
  onChange,
}: {
  colors: ThemeColors | undefined
  mode: Mode
  tone: ToneName
  onMode: (mode: Mode) => void
  onTone: (tone: ToneName) => void
  onChange: (path: string, value: string | undefined) => void
}) {
  const palette = derivePalette(colors, mode)[tone]
  const picked = colors?.tones?.[mode]?.[tone] ?? {}
  return (
    <div class="bm-stack bm-stack-tight">
      <div class="bm-segmented" role="radiogroup" aria-label="Mode to edit">
        {(['light', 'dark'] as const).map((choice) => (
          <button type="button" key={choice} role="radio" aria-checked={mode === choice} onClick={() => onMode(choice)}>
            {choice === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
      <div class="bm-segmented" role="radiogroup" aria-label="Tone to edit">
        {TONES.map((choice) => (
          <button type="button" key={choice.id} role="radio" aria-checked={tone === choice.id} onClick={() => onTone(choice.id)}>
            {choice.label}
          </button>
        ))}
      </div>
      <div class="bm-overrides">
        {OVERRIDE_TOKENS.map((name) => (
          <ColorRow
            row
            key={`${mode}-${tone}-${name}`}
            label={TOKEN_LABEL[name]}
            hint=""
            fallback={tokenToHex(palette[name])}
            unsetTag="derived"
            value={picked[name]}
            onChange={(value) => onChange(`tones.${mode}.${tone}.${name}`, value)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Design tab: seed colors for the site palette, a live preview of the derived tones in light and
 * dark, and the text-contrast pairs that fall under WCAG AA. The editor's own colors are not part of this.
 */
export function DesignForm({
  colors,
  modeControl,
  onChange,
}: {
  colors: ThemeColors | undefined
  /** The site color-mode control, rendered by the caller so it shares its state handling. */
  modeControl: ComponentChildren
  /** `path` is relative to `theme.colors`: a seed name or `tones.<mode>.<tone>.<token>`. */
  onChange: (path: string, value: string | boolean | undefined) => void
}) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [mode, setMode] = useState<Mode>('light')
  const [tone, setTone] = useState<ToneName>('base')
  const checks = contrastChecks(colors)
  const failing = checks.filter((check) => !check.ok)
  const customized = hasThemeColors(colors)
  const overridden = hasOverrides(colors)
  const advanced = colors?.customTones === true || (colors?.customTones === undefined && overridden)
  return (
    <div class="bm-stack">
      <div class="bm-stack">
        <p class="bm-group">Mode</p>
        {modeControl}
      </div>
      <div class="bm-stack">
        <div class="bm-group-split">
          <p class="bm-group">
            Colors
            <Info text="The editor keeps its own colors. Only the site changes." label="About colors" />
          </p>
          {customized && (
            <button
              type="button"
              class="bm-tertiary bm-danger"
              onClick={() => {
                for (const seed of SEEDS) onChange(seed.key, undefined)
                onChange('tones', undefined)
                onChange('customTones', undefined)
              }}
            >
              Reset all
            </button>
          )}
        </div>
        {SEEDS.map((seed) => (
          <ColorRow
            key={seed.key}
            label={seed.label}
            hint={seed.hint}
            fallback={seed.key === 'link' ? tokenToHex(derivePalette(colors, 'light').base.link) : seed.fallback}
            unsetTag={seed.key === 'link' ? 'auto' : 'default'}
            value={colors?.[seed.key]}
            onChange={(value) => onChange(seed.key, value)}
          />
        ))}
      </div>
      <div class="bm-stack bm-stack-tight">
        <p class="bm-group">
          Preview
          <Info text="Updates the page live. Light and dark are both shown." label="About preview" />
        </p>
        <ToneMatrix
          colors={colors}
          mode={mode}
          tone={tone}
          editable={advanced}
          onPick={(nextMode, nextTone) => {
            setMode(nextMode)
            setTone(nextTone)
          }}
        />
        {failing.length === 0 ? (
          <p class="bm-note" role="status">
            Every text pair reaches 4.5:1 (WCAG AA).
          </p>
        ) : (
          <div class="bm-alert bm-alert-notice" role="status">
            <p class="bm-note">
              {failing.length} text {failing.length === 1 ? 'pair is' : 'pairs are'} below 4.5:1. Pick a lighter or darker color.
            </p>
            <ul class="bm-contrast-list">
              {failing.slice(0, 6).map((check) => (
                <li key={`${check.mode}-${check.tone}-${check.pair}`}>
                  {check.mode === 'light' ? 'Light' : 'Dark'} · {check.tone} · {check.pair.toLowerCase()}: {check.ratio.toFixed(1)}:1
                </li>
              ))}
              {failing.length > 6 && <li>and {failing.length - 6} more</li>}
            </ul>
          </div>
        )}
      </div>
      <div class="bm-stack bm-stack-tight">
        <p class="bm-group">Advanced</p>
        <label class="bm-switch-row">
          <span class="bm-switch-text">
            <span class="bm-switch-title">
              Override individual colors
              <Info
                label="About overriding colors"
                text="Set any background, text, accent or link per mode and tone. Overrides win over the brand colors above. Turning this off keeps your values but stops using them."
              />
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={advanced}
            onChange={(event) => {
              const on = event.currentTarget.checked
              // With nothing saved there is nothing to keep, so the flag is dropped instead of stored as false.
              onChange('customTones', on ? true : overridden ? false : undefined)
              setConfirmReset(false)
            }}
          />
        </label>
        {advanced && (
          <>
            <TonesEditor colors={colors} mode={mode} tone={tone} onMode={setMode} onTone={setTone} onChange={onChange} />
            {overridden &&
              (confirmReset ? (
                <div class="bm-actions">
                  <button
                    type="button"
                    class="bm-primary bm-danger"
                    onClick={() => {
                      onChange('tones', undefined)
                      setConfirmReset(false)
                    }}
                  >
                    Remove all overrides
                  </button>
                  <button type="button" onClick={() => setConfirmReset(false)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" class="bm-tertiary bm-danger" onClick={() => setConfirmReset(true)}>
                  Reset overrides
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  )
}
