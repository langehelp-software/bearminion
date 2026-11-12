---
'bearminion': patch
'create-bearminion': patch
---

Hosted editor: images no longer wait for a build. `/__bearminion/assets` serves an image from the repository to signed-in people, so previews in the editor and pages that use a file uploaded after the last build draw it at once instead of showing alt text or failing. The default template's components show the editor's empty-slot hints on the hosted editor deployment too (`src/lib/editing.ts`). Requests that arrive together when the GitHub token is about to expire now share one renewal, and one that loses the race keeps the old token while it works, so a page load no longer signs the person out.
