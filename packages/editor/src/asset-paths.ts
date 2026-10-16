/* Pure helpers: the editor overlay imports them too, so nothing here may touch node:*. */

/** A project-relative image path that content may point at, such as `src/assets/uploads/hero-a1b2c3d4.png`. */
export function isAssetPath(src: string): boolean {
  if (src.includes('..') || src.includes('\\') || src.startsWith('/')) return false
  return /^src\/assets\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:png|jpe?g|webp|gif|avif)$/i.test(src)
}

export interface AssetRef {
  /** Dotted path of the string in the document: `sections.0.props.image.src`, `seo.ogImage`. */
  path: string
  src: string
}

/** Every local image path in a document, in document order. Remote URLs and placeholders are not files. */
export function assetRefs(document: unknown): AssetRef[] {
  const found: AssetRef[] = []
  const visit = (value: unknown, at: string) => {
    if (typeof value === 'string') {
      if (isAssetPath(value)) found.push({ path: at, src: value })
      return
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) visit(item, at === '' ? String(index) : `${at}.${index}`)
      return
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, item] of Object.entries(value)) visit(item, at === '' ? key : `${at}.${key}`)
    }
  }
  visit(document, '')
  return found
}

/** Site fields people know by name. Anything else is shown by its path. */
const SITE_FIELD_NAMES: Record<string, string> = {
  'brandLogo.src': 'brand logo',
  'favicon.src': 'favicon',
  'seo.ogImage': 'social preview image',
}

/** "Site settings › brand logo", "Home page › Hero", "About page › social preview image". */
export function describeSiteRef(ref: AssetRef): string {
  return `Site settings › ${SITE_FIELD_NAMES[ref.path] ?? ref.path}`
}

export function describePageRef(
  ref: AssetRef,
  page: { title: string; sections: readonly { type: string }[] },
  labels: Record<string, string>,
): string {
  const where = (() => {
    if (ref.path === 'seo.ogImage') return 'social preview image'
    const index = /^sections\.(\d+)\./.exec(ref.path)?.[1]
    const type = index === undefined ? undefined : page.sections[Number(index)]?.type
    return type === undefined ? ref.path : (labels[type] ?? type)
  })()
  return `${page.title || 'Untitled'} page › ${where}`
}

/**
 * Where the unsaved drafts use the image at `src`, in the words `describeSiteRef` and `describePageRef` use. The
 * server only reads saved files, so this is what stops an image that only the draft points at from being deleted.
 */
export function draftImageUsages(
  src: string,
  drafts: { page: { title: string; sections: readonly { type: string }[] } | null; site: unknown },
  labels: Record<string, string>,
): string[] {
  const usages: string[] = []
  for (const ref of assetRefs(drafts.site)) if (ref.src === src) usages.push(describeSiteRef(ref))
  if (drafts.page) for (const ref of assetRefs(drafts.page)) if (ref.src === src) usages.push(describePageRef(ref, drafts.page, labels))
  return usages
}
