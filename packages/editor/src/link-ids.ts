import type { z } from 'zod'

/** Walk objects that look like links (`label` + `href`) and report each `id`. */
export function walkLinkIds(
  value: unknown,
  path: readonly (string | number)[],
  visit: (id: string, path: (string | number)[]) => void,
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) walkLinkIds(item, [...path, index], visit)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  const link = typeof record.label === 'string' && typeof record.href === 'string'
  if (link && typeof record.id === 'string') visit(record.id, [...path, 'id'])
  for (const [key, child] of Object.entries(record)) {
    if (
      link &&
      (key === 'label' || key === 'href' || key === 'newTab' || key === 'id' || key === 'trackingId' || key === 'variant' || key === 'size')
    ) {
      continue
    }
    walkLinkIds(child, [...path, key], visit)
  }
}

/**
 * Link ids on a page must be unique and must not reuse a section anchor.
 * Section anchors are HTML ids, so a button id with the same value would collide.
 */
export function addLinkIdIssues(sections: readonly unknown[], ctx: z.RefinementCtx): void {
  const anchors = new Set<string>()
  for (const section of sections) {
    if (typeof section !== 'object' || section === null) continue
    if ('anchor' in section && typeof section.anchor === 'string' && section.anchor !== '') {
      anchors.add(section.anchor)
    }
  }
  const seen = new Set<string>()
  sections.forEach((section, index) => {
    if (typeof section !== 'object' || section === null || !('props' in section)) return
    walkLinkIds(section.props, [index, 'props'], (id, path) => {
      if (anchors.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Link id "${id}" collides with section anchor "${id}"`,
          path,
        })
      }
      if (seen.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate link id "${id}"`,
          path,
        })
      }
      seen.add(id)
    })
  })
}
