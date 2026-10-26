---
'bearminion': patch
'create-bearminion': patch
---

Fix: a video uploaded in the editor now plays in the dev site straight away. Vite learns which files `public/` holds from its file watcher, and the editor keeps the videos folder out of that watcher so uploads do not reload the page, so a new video answered 404 until `astro dev` was restarted. The editor now tells Vite about the one file that was added or removed. The template's `astro.config.ts` also reads `BEARMINION_VIDEOS_DIR` (used by the tests, like the content and uploads overrides).
