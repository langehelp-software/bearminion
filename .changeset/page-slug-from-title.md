---
'bearminion': patch
---

The New page form makes the slug from the title as you type it, until you edit the slug by hand, and numbers it when a page with that slug exists (`about-2`). Changing a title afterwards never changes the slug. A failed create now shows the server's reason in the form instead of doing nothing. `slugifyAnchor` writes accented letters as the plain letter (`ą` is `a`, `ł` is `l`, `ß` is `ss`) instead of turning them into hyphens, so `Łódź` is `lodz` and not `o-dz`; this also fixes section anchors suggested from non-ASCII headings.
