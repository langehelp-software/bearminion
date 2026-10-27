---
title: The command line
description: "npx bearminion add copies sections into your site with the files they need and never touches a file you changed; status shows what is out of date; sync lists your section directories; and how releases are numbered."
---

`bearminion` ships a command line next to the library. It adds sections to a site that was created earlier, tells you which of a site's files differ from the installed release, and adds a form handler, and keeps the list of a site's sections in step with its directories. It runs in the folder of your site (or with `--cwd`) and needs nothing but the `bearminion` package you already have.

## Add a section

A site is a copy of the starter, so it does not get new sections when the starter does. `add` copies a section, and the files it imports, from the installed `bearminion` into your site:

```sh
npx bearminion add --list              # what can be added; * marks what the site already has
npx bearminion add gallery text        # copy two sections
npx bearminion add gallery --dry-run   # show what would be written, write nothing
```

Names are the section's directory (`logo-strip`) or its type in content files (`logoStrip`). The files come from the same release as the `bearminion` you run, so what you get always matches the library, and nothing is fetched from the network. Sites created before `sync` existed list their sections by hand and cannot use `add` until they move over; see [Add a section type](../templates/default/README.md#add-a-section-type) in the template guide.

### What happens to each file

A section is more than its own directory: it imports atoms, molecules and helpers that you may have changed. So `add` looks at every file it would write and decides one of four things:

| It says | Because | What `add` does |
| --- | --- | --- |
| `create` | The site has no such file | Writes it |
| `same` | The site's file is this release's | Leaves it |
| `update` | The site's file is an earlier release's and you did not change it | Replaces it with this release's |
| `conflict` | The site's file is neither: you changed it | Stops. Nothing is written |

It knows an earlier release's file because `bearminion` carries the hash of every file of every release since `add` was introduced. That works on any site, with or without a lock file.

An `update` is the one to look at: other sections use the same shared file, and the new version may look a little different. `add` says so, and a `git diff` and your build show the rest. Commit before you add, so git is the undo.

When a file conflicts:

```sh
npx bearminion add gallery --diff        # how your file differs from this release
npx bearminion add gallery --overwrite   # replace your version with this release's
```

`--overwrite` is the only way `add` replaces a file you changed.

### Everything that follows

After the files are written, `add`:

1. Lists the new directories in `definitions.gen.ts` and `components.gen.ts`, the same as `npx bearminion sync`.
2. Records the files in `bearminion.lock.json`.
3. Prints the npm packages the sections import that your `package.json` does not list, with the command that installs them. `--install` runs it for you, with the package manager your lock file names.

It never edits `definitions.ts`, `astro.config.ts` or a content file.

### Options

| Option | |
| --- | --- |
| `--list` | List the sections that can be added |
| `--dry-run` | Show the plan and write nothing |
| `-y`, `--yes` | Do not ask before writing. Without it, a terminal asks; anything else (a script, CI) stops and tells you to pass `--yes` or `--dry-run` |
| `--overwrite` | Replace files you changed |
| `--diff` | Show how files you changed differ from this release |
| `--install` | Install the npm packages the sections need |
| `--json` | Print one JSON document instead of text. It needs `--yes` or `--dry-run`, and is made for scripts and AI agents |
| `--cwd <dir>` | Run as if started in this folder |

Exit code `0` is a section added, or already there. `1` is a conflict, an unknown section, a site `add` cannot work on, or a failed install. `2` is a command that was not understood.

With `--json` the document has `ok`, `version`, `sections`, `files` (each with its `path` and `action`), `npm` (what is missing), `dirty` (files to be overwritten that git shows as changed), and, after a write, `written`.

## Add a form handler

The Contact form posts to `/api/contact`, and a handler in `src/forms/contact.ts` answers there. `add form` writes it, and the few lines of glue your host needs to run it:

```sh
npx bearminion add form --list                   # what can be added
npx bearminion add form resend --host vercel     # the handler and the glue
npx bearminion add form resend                   # the host is read from the project
npx bearminion add form --host vercel            # glue only, for a handler you already have
```

Today that is one service and one host, the ones that have been sent through for real: `resend` (email) and `vercel` (`api/contact.ts`). The other services and hosts are in [Forms](forms.md) as files to copy by hand, and join the command one at a time, after a real message has gone through each.

> **Set the addresses in the environment.** The handler reads the sender and the receiver from `CONTACT_FROM` and `CONTACT_TO`, so no address is written into your repository, and it refuses to send until both are set along with `RESEND_API_KEY`. `CONTACT_FROM` has to be on a domain you verified with Resend.

Without `--host`, the command looks for `vercel.json`, `netlify.toml`, `wrangler.toml` and an Astro server adapter. If it finds none, two, or a host it has no glue for, it writes the handler only and says so. A file that is already there and differs from the recipe stops the command; `--overwrite` replaces it. `--dry-run`, `--yes` and `--json` work as for sections. The files are noted in `bearminion.lock.json`, and the command prints the three values to set. [Forms](forms.md) explains the handler.

## See what is out of date

`status` compares every file of the sections your site has with the installed release. It reads, and writes nothing:

```sh
npx bearminion status
npx bearminion status --json
```

Each file is in one of these states:

| State | Meaning | What `add` does |
| --- | --- | --- |
| `current` | It is this release's file | Nothing to do |
| `outdated` | You did not change it, and the release has | Replaces it |
| `edited` | You changed it, and the release has not changed it since you got it | Leaves it alone |
| `conflict` | You and the release both changed it | Stops |
| `differs` | It is not this release's, and there is no lock file to say who changed it | Stops |

`status` ends with the command that brings the outdated sections up to date. A section with a `conflict` or `differs` file is left out of that command, because `add` would stop on it: look at it with `add <name> --diff`.

## Versions and updates

The starter and `bearminion` ship together, in one numbered release, and `create-bearminion` has the same number. A release is a package on npm; your site records nothing about it except the files and `bearminion.lock.json`.

- A **minor** release (1.8 to 1.9) can bring a new section, a new form recipe or a changed shared file. Run `npx bearminion@latest status` to see what moved, then `npx bearminion@latest add <name>` for a new section or to update an outdated one.
- A **patch** release fixes things inside the package. It does not change the files that `add` copies, unless the fix is in one of them.
- A **major** release can change how sites are built. It comes with its own upgrade notes.

Running `npx bearminion@latest` uses the latest release's files, whatever your site started from. Run `npm update bearminion` as well when you want the library itself to move; the files `add` copies and the library are meant to match.

`add` never edits a file you changed, never edits `definitions.ts`, `astro.config.ts` or a content file, and there is no command that updates everything at once. Sections are copied, not linked: once a file is yours, it stays yours.

## The lock file

`bearminion.lock.json` sits in the site's root and is committed with it. For each file `add` handles it records the release the file came from and its hash. A new site starts with one. `add` keeps it up to date and creates it when a site has none; it is how `add` and `status` tell a file you left alone from one you changed, even when the release it came from is not in the history this version of `bearminion` carries.

Do not edit it by hand. Delete it and the next `add` writes a new one for the files it touches.

## Keep the section list in step

`sync` rewrites `definitions.gen.ts` and `components.gen.ts` from the directories under `src/components/sections/`. Run it after you add, rename or remove a section directory by hand:

```sh
npx bearminion sync            # rewrite
npx bearminion sync --check    # write nothing; exit 1 when they are stale (for CI)
```

A section is a directory with a `definition.ts` that exports its definition under the camelCase name, and a component named after the directory. `logo-strip/` exports `logoStrip` from `definition.ts` and has `LogoStrip.astro`. `astro build`, `astro check` and `astro sync` stop with a reminder when the generated files are stale, and `astro dev` warns.

## How it knows

For people who want to check the reasoning: the registry is generated from the starter at release time, with each section's import graph walked and its npm packages read from the starter's `package.json`; the hash of every file of every release is kept in the repository's `packages/editor/registry-history.json`. Nothing is downloaded when you run `add`.
