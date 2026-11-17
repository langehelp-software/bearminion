---
"bearminion": minor
"create-bearminion": minor
---

Three new sections and four new layouts, from the bearminion.com redesign. A new site does not get the sections; `npx bearminion add <name>` adds one.

- **Code tabs** (`add code-tabs`): code samples in tabs, each with a title, a line of explanation and a file name, and up to six numbered points under them. The code panel is dark in every tone and draws trailing `//` and `#` comments in green. Layouts `side` and `top`.
- **Compare** (`add compare`): options side by side in a table, with your column highlighted and a note under it. A row with a value too many or too few for the columns is refused. Layouts `centered` and `left`.
- **Changelog** (`add changelog`): the latest releases, each with a version, a title, what changed and a link to the notes; the first one is shown as the latest. Layouts `cards` and `timeline`.
- **Steps** gets `keys`, with a keyboard shortcut or a typed word in front of each step and a video beside them (new optional `keys`, `video`, `poster`, `caption` and `duration`), and `panel`, the steps as numbered tiles on an accent panel.
- **Features** gets `screens`: a 16:10 screenshot on top of every card.
- The editor's sidebar edits a field named `code` in a multi-line box.

Existing pages keep working as they are: every new field is optional. A site made earlier gets the new layouts with `npx bearminion add steps` or `add features`, which replaces the files you did not change; `npx bearminion status` lists them.
