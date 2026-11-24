#!/usr/bin/env bash
# Turns an empty repository into bearminion.com as a standalone BearMinion site: the published template from npm,
# plus the site's own content, images, video, form handler and the two sections only bearminion.com has.
#
#   cd ~/projekty/bearminion-web            # fresh clone of the new repo (only .git in it)
#   bash ~/projekty/bearminion/scripts/split-web.sh ~/projekty/bearminion
#
#   BEARMINION_VERSION=1.26.0 bash …        # pin the template version (default: latest)
#
# Writes nothing outside the current directory and commits nothing.
set -euo pipefail

MONOREPO=${1:?Usage: split-web.sh <path to the bearminion monorepo>}
WEB="$(cd "$MONOREPO" && pwd)/apps/web"
VERSION=${BEARMINION_VERSION:-latest}
TARGET=$(pwd)

# Sections in the template's registry that the starter leaves out. bearminion.com has every template section.
EXTRA_SECTIONS=(changelog code-tabs compare contact logo-strip pricing stats testimonials)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# --- Preflight -------------------------------------------------------------------------------------------------------
[ -f "$WEB/package.json" ] || die "No apps/web in $MONOREPO."
[ "$TARGET" != "$WEB" ] || die "Run this in the new repository, not in apps/web."
command -v pnpm >/dev/null || die "pnpm is not installed."
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || die "Node 22 or newer is needed."
blocking=$(ls -A | grep -vxE '\.git|\.DS_Store|README\.md|LICENSE|\.gitignore' || true)
[ -z "$blocking" ] || die "This directory is not empty: $(echo $blocking)"
# GitHub's "Initialize with README/.gitignore/LICENSE" files would block the scaffold; set them aside and put LICENSE back.
stash=$(mktemp -d)
for f in README.md LICENSE .gitignore; do [ -e "$f" ] && mv "$f" "$stash/"; done

# --- 1. The published template ---------------------------------------------------------------------------------------
say "1/7 Creating the site from create-bearminion@$VERSION"
pnpm create "bearminion@$VERSION" . --yes --no-install --no-git --pm pnpm --name BearMinion --url https://bearminion.com
[ -e "$stash/LICENSE" ] && mv "$stash/LICENSE" .
rm -rf "$stash"

# bearminion.com's package name, and any dependency it has that the template does not (bearminion-site is the
# monorepo-only link to templates/default and is dropped).
node --input-type=module - "$WEB/package.json" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
const web = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.name = 'bearminion-com'
pkg.description = 'bearminion.com, built with BearMinion.'
for (const field of ['dependencies', 'devDependencies']) {
  for (const [name, range] of Object.entries(web[field] ?? {})) {
    if (name === 'bearminion-site' || String(range).startsWith('workspace:')) continue
    pkg[field] ??= {}
    if (!(name in pkg[field]) && !(name in (pkg.dependencies ?? {}))) pkg[field][name] = range
  }
}
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
JS

say "2/7 Installing"
pnpm install

# --- 2. Template sections the starter leaves out, and the contact form -----------------------------------------------
say "3/7 Adding sections: ${EXTRA_SECTIONS[*]}"
pnpm exec bearminion add "${EXTRA_SECTIONS[@]}" --yes --install

say "4/7 Adding the contact form (Resend on Vercel)"
pnpm exec bearminion add form resend --host vercel --yes --install
# The site's own handler replaces the generated one. The lock keeps the release's hash, so `add` sees it as yours.
cp "$WEB/api/contact.ts" api/contact.ts
mkdir -p src/forms && cp -R "$WEB/src/forms/." src/forms/

# --- 3. The site's own files -----------------------------------------------------------------------------------------
say "5/7 Copying content, images, public files and site-only sections"
# The template's sample content, images and public files go: the site has its own (apps/web never had the template's).
rm -rf content public src/assets
cp -R "$WEB/content" content
cp -R "$WEB/public" public
mkdir -p src/assets
cp -R "$WEB/src/assets/uploads" src/assets/uploads
# Empty content folders (git does not keep them anyway).
find content -type d -empty -delete

for dir in "$WEB"/sections/*/; do
  name=$(basename "$dir")
  [ -e "src/components/sections/$name" ] && die "src/components/sections/$name exists in the template. Rename apps/web/sections/$name."
  cp -R "${dir%/}" "src/components/sections/$name"
done
find content public src -name .DS_Store -delete
pnpm exec bearminion sync

# --- 4. Check -------------------------------------------------------------------------------------------------------
say "6/7 Checking"
pnpm exec bearminion sync --check
pnpm exec bearminion check form --host vercel
pnpm exec astro check
pnpm build

say "7/7 Done"
cat <<MSG
bearminion.com is ready here, on bearminion $(node -p "require('./node_modules/bearminion/package.json').version").

Next:
  git add -A && git commit -m "bearminion.com as a standalone BearMinion site"
  Vercel: point the bearminion.com project at this repository, Root Directory "/", and set RESEND_API_KEY,
          CONTACT_FROM and CONTACT_TO (copy them from the current project).
  Hosted editor: point its GitHub store at this repository and give the GitHub App access to it.
  Not copied: .env (secrets) and README.md (the template's; rewrite it for this site).
MSG
