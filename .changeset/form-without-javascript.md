---
'bearminion': patch
'create-bearminion': patch
---

The Contact form works with JavaScript off. A browser that posts the form itself is no longer left on the raw JSON answer: `defineForm` redirects it back to the page, to a "Message sent." block or a "not sent" line (only when the `Referer` is on the same site; otherwise the JSON answer stays). Pages with section motion were also invisible without JavaScript, because sections start transparent and a script reveals them; they now show.
