/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Set by the hosted editor's build (`bearminionHostedEditor`). Not set in a public site's build. */
  readonly BEARMINION_HOSTED?: boolean
  /** Set by the docs' build of the section previews. Not set in a site's own build. */
  readonly BEARMINION_PREVIEWS?: boolean
}

declare namespace App {
  interface Locals {
    /** Set by the hosted editor (`bearminionHostedEditor`) for a signed-in person: the repository's current content. */
    bearminion?: import('bearminion/hosted').HostedLocals
  }
}
