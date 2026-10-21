---
"bearminion": minor
---

Section tab controls follow the section's schema instead of guessing from values:

- Any string enum inside a section's props (such as a list item's `icon`) is a choice in the sidebar instead of a free text box. A new `icons` option on `defineSection` draws the choices of a field as an icon grid: `icons: { 'steps[].icon': { terminal: 'M4 5h16…', … } }`, SVG path data on a 24 × 24 grid, one per choice.
- A new `showWhen` option on `defineSection` hides props the section's options make unused, such as `{ poster: { kind: 'video' } }`. A list matches any of its values, and `variant`, `tone` and `motion` count as options. Hidden props keep their value in the file.
- Variant, tone and choice options with up to four choices are segmented controls instead of selects.
- An image prop that is missing from the content now offers an image slot whatever it is called. It used to be a text box unless the prop was named `image` or `logo`, so a missing `poster` could not be set.

`defineSection` checks `icons` and `showWhen` against the schema and options and throws on a mistake. `GET /schema` serves `fieldChoices`, `fieldIcons`, `fieldImages` and `showWhen`.
