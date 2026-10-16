/** Attributes shared by every link and button renderer. */

export type ButtonStyleChoice = 'primary' | 'secondary' | 'tertiary'
export type ButtonRole = 'primary' | 'secondary' | 'strong' | 'ghost' | 'text'

export interface LinkFields {
  href: string
  style?: ButtonStyleChoice
  newTab?: boolean
  id?: string
  trackingId?: string
}

/**
 * Button look for a link. The editor's `style` wins; without it the section keeps its own design (`fallback`).
 * On an accent background `primary` would vanish, so it becomes the inverted `strong` button there.
 */
export function buttonVariant(link: LinkFields, fallback: ButtonRole, onAccent = false): ButtonRole {
  switch (link.style) {
    case 'primary':
      return onAccent ? 'strong' : 'primary'
    case 'secondary':
      return 'secondary'
    case 'tertiary':
      return 'text'
    default:
      return fallback
  }
}

/** Extra classes for a button on an accent background, where the default colors would not read. */
export function onAccentClass(variant: ButtonRole): string | undefined {
  if (variant === 'secondary') return 'text-on! shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--on)_35%,transparent)]'
  if (variant === 'text') return 'text-on!'
  return undefined
}

export function opensNewTab(link: LinkFields): boolean {
  const external = /^https?:\/\//i.test(link.href)
  return link.newTab === true || (link.newTab !== false && external)
}

/** Spread onto `<Button>`. `newTab` is a component prop, not an HTML attribute. */
export function buttonLinkProps(link: LinkFields): {
  href: string
  newTab?: boolean
  id?: string
  'data-analytics'?: string
} {
  return {
    href: link.href,
    newTab: link.newTab,
    id: link.id,
    'data-analytics': link.trackingId,
  }
}

/** Spread onto a plain `<a>`. */
export function anchorAttrs(link: LinkFields): {
  href: string
  id?: string
  target?: '_blank'
  rel?: 'noopener noreferrer'
  'data-analytics'?: string
} {
  const blank = opensNewTab(link)
  return {
    href: link.href,
    id: link.id,
    target: blank ? '_blank' : undefined,
    rel: blank ? 'noopener noreferrer' : undefined,
    'data-analytics': link.trackingId,
  }
}
