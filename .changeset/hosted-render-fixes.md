---
'bearminion': patch
'create-bearminion': patch
---

Hosted editor: a page that uses an image uploaded after the last build no longer answers 500. The template's `Seo` (share image) and `LogoStrip` components threw for a file the build does not hold; on the hosted editor they now draw it from the editor's image route or leave it out. A page that cannot be drawn shows the signed-in person the reason, with the editor script on it, instead of a blank 500.
