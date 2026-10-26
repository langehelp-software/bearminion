---
name: sync-site-version
description: Keep apps/web (bearminion.com), docs/ (docs.bearminion.com) and the READMEs in step with the current bearminion version and features. Use after any change to packages/editor or packages/create-bearminion, when adding a changeset, when a "Version Packages" PR merges, and before a release.
---

# Sync site and docs with the bearminion version

`bearminion` and `create-bearminion` are one fixed changesets group, so there is one version number. The sites and docs must never claim a version, feature, option or flag that the published package does not have, and must not lag behind one it does.

## Source of truth

```bash
node -p "require('./packages/editor/package.json').version"   # the version in the repo
npm view bearminion version                                    # the version on npm
```

The hero badge shows the version the pull request releases, not the one before it. The site is published after the release, so a badge on the old version is wrong from the day it ships. Work it out as the repo version plus the highest pending changeset bump (`minor` on 1.5.0 means "BearMinion 1.6"), and set it in the same pull request as the changeset. If the bump level changes, fix the badge. Other claims (features, options, flags) follow the same rule: describe what this pull request ships. Prose avoids version numbers altogether.

## Find stale version strings

```bash
grep -rnE "BearMinion v?[0-9]+\.[0-9]+|bearminion@[0-9^~]|create-bearminion@[0-9]|\bv?[0-9]+\.[0-9]+\.[0-9]+\b" \
  apps/web/content apps/web/README.md apps/docs/src docs README.md \
  templates/default/README.md packages/*/README.md CONTRIBUTING.md
```

Ignore: `0.0.0` placeholders, tarball example file names (`bearminion-1.0.0.tgz`), dependency ranges in `package.json` and changelogs. Everything else must match the version this pull request releases or be rewritten without a number ("latest").

Known place: the hero badge in `apps/web/content/pages/index.json` (`tag`, for example "BearMinion 1.4 · Available now"; its `href` points at the GitHub releases page).

## What to update when code changes

| Change | Update |
| --- | --- |
| Editor UI, tabs, shortcuts, dialogs | `docs/editor.md`, screenshots in `docs/images/` |
| Content model, section props, schema | `docs/content.md`, `templates/default/README.md` |
| `defineSection`, `defineTheme`, `defineSite` | `docs/themes.md` |
| `bearminion({...})` options, env variables | `docs/integration.md` |
| Dev API endpoints or responses | `docs/dev-api.md` |
| `create-bearminion` flags, prompts, output | `docs/getting-started.md`, `packages/create-bearminion/README.md` |
| New or changed template section | `docs/sections.md` (layouts, options, content, and the screenshots in `docs/images/sections/`), `templates/default/README.md`, then `apps/web` content if the site should use it |
| Any user-facing feature | Claims on bearminion.com: features, FAQ, stats, hero, video label |

Rules:

1. `docs/*.md` is the single source for docs.bearminion.com. Keep each page's `title` and `description` frontmatter and do not add an `# H1`. Use `other.md#anchor` links; the build rewrites and checks them.
2. Never edit template code inside `apps/web`; it is copied from `templates/default` by `scripts/sync-template.mjs`. Change the template, then run the sync.
3. `apps/web/content` and `src/assets/uploads` are the site's own. Keep the editor's sorted-key JSON layout; prefer saving through the editor (`pnpm web:dev`) so Zod validates the write.
4. Copy follows `claude/bearminion-brand-voice.md` (project doc): plain facts in docs, personality in intros and warnings.
5. Prefer "latest" over a version number in prose. A number is only for the badge and release notes.
6. A changeset is required for any change to a published package. The `bearminion` and `create-bearminion` bump together.

Docs ship in the same pull request as the code. A change to a published package is not done until the pages above are updated.

## Check before finishing

```bash
pnpm web:build && pnpm docs:build   # docs build fails on a broken link or anchor
pnpm lint
git status --short                  # CI fails when the builds leave a change behind
```

Then re-read the claims you touched against the code, not against the old docs.
