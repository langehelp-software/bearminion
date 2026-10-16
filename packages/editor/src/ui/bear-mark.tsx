import bearMarkSvg from './assets/bear-mark.svg?raw'

/**
 * The editor's own copy of the bear (`assets/bear-mark.svg`), bundled into the overlay. Sites and themes never supply it.
 * Drawn as inline SVG built from the asset's paths, not as an `<img src="data:…">`: a site whose Content-Security-Policy
 * leaves `data:` out of `img-src` would otherwise lose the bear. `createElementNS` is also what Trusted Types allow.
 */
const PATHS = [...bearMarkSvg.matchAll(/<path\s+fill="([^"]+)"\s+d="([^"]+)"\s*\/>/g)].map(([, fill = '', d = '']) => ({ fill, d }))

/** Decorative: the product name always sits next to it. */
export function BearMark({ class: className }: { class?: string }) {
  return (
    <svg class={className} viewBox="0 0 21 19" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
      {PATHS.map((path) => (
        <path key={path.d} fill={path.fill} d={path.d} />
      ))}
    </svg>
  )
}
