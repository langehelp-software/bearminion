/**
 * True while someone is editing: on the dev server, and on the hosted editor's own deployment (its build sets
 * BEARMINION_HOSTED). A built public site is neither, so editor hints and editor-only image routes stay out of it.
 */
export const editing = Boolean(import.meta.env.DEV || import.meta.env.BEARMINION_HOSTED)

/**
 * True wherever an empty frame should still be drawn, so a layout shows its shape: while editing, and in the section
 * previews the docs build (apps/docs/scripts/build-previews.mjs sets BEARMINION_PREVIEWS). A public site leaves them out.
 */
export const placeholders = editing || Boolean(import.meta.env.BEARMINION_PREVIEWS)

/** A picture to draw: a path or an address, not empty and not the starter's `placeholder`. */
export const hasImageSrc = (src: string | undefined): src is string => Boolean(src) && src !== 'placeholder'

/**
 * Whether an image slot is drawn at all. A hidden image never is; an empty one (no file yet, or `placeholder`) only where
 * placeholders show, so a public build drops the striped wireframe and the layout closes up around the text.
 */
export const showsImage = (image: { src?: string; hidden?: boolean } | undefined): boolean =>
  !image?.hidden && (placeholders || hasImageSrc(image?.src))
