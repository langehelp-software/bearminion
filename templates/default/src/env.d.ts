/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Set by the hosted editor's build (`bearminionHostedEditor`). Not set in a public site's build. */
  readonly BEARMINION_HOSTED?: boolean
}

declare namespace App {
  interface Locals {
    /** Set by the hosted editor (`bearminionHostedEditor`) for a signed-in person: the repository's current content. */
    bearminion?: import('bearminion/hosted').HostedLocals
  }
}
