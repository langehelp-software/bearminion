---
"create-bearminion": patch
"bearminion": patch
---

Starter: an image with no picture (empty or `placeholder`) no longer draws its striped wireframe on a built site. The wireframe still shows on the dev server, in the hosted editor and in the docs section previews; a public build leaves the slot out and the layout closes up (text-image and the testimonial carousel drop to one column, a testimonial falls back to its initial, gallery tiles with no picture are skipped). New helpers in `src/lib/editing.ts`: `hasImageSrc` and `showsImage`. Existing sites: copy `src/lib/editing.ts`, `MediaFrame.astro` and the hero, text-image, features, testimonials and gallery sections from the starter.

Media: a YouTube or Vimeo video takes its own shape instead of the section's Shape setting, so it no longer shows bars above and below. Vimeo is asked for the size (oEmbed) at build time, or on the server for the editor; a video it will not describe keeps the Shape setting. Vimeo now draws any bars in black (`transparent=0`) rather than in the colour behind the frame. Existing sites: copy `src/lib/video-shape.ts` and `MediaPlayer.astro` from the starter.
