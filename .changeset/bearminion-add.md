---
'bearminion': minor
'create-bearminion': minor
---

`npx bearminion add <section...>` copies a section into an existing site, with the atoms, molecules and helpers it imports, and lists it in the generated section files. It writes a file only when the site has none, or has an earlier release's copy that nobody changed; a file you changed stops it, and nothing is written unless you pass `--overwrite`. `--list`, `--dry-run`, `--yes`, `--diff`, `--install` and `--json` are there for people and for scripts. New sites start with a `bearminion.lock.json`, and `add` keeps it up to date. The files come from a registry that ships inside the package, so nothing is downloaded. See [The command line](https://github.com/langehelp-software/bearminion/blob/main/docs/cli.md).
