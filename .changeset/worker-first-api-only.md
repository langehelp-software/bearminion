---
'bearminion': patch
'create-bearminion': patch
---

The Cloudflare Wrangler config that `add form --host cloudflare` writes now uses `"run_worker_first": ["/api/*"]` instead of `true`, so page views are served from the built site without running the Worker, and only `/api/*` reaches the handler. A site that already has `true` keeps working. Tried on a real deploy: pages load, `/api/contact` answers, and a message arrives.
