/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by the hosted editor (`bearminionHostedEditor`) for a signed-in person: the repository's current content. */
    bearminion?: import('bearminion/hosted').HostedLocals
  }
}
