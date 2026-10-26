import { fileURLToPath } from 'node:url'
import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { checkLinks } from './src/check-links'
import { remarkRepoLinks } from './src/remark-repo-links'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const github = 'https://github.com/langehelp-software/bearminion'
const linkProblems: string[] = []

export default defineConfig({
  site: 'https://docs.bearminion.com',
  markdown: {
    // The pages are the repository's docs/ folder; their GitHub-style links become site and GitHub URLs.
    processor: unified({
      remarkPlugins: [[remarkRepoLinks, { repoRoot, docsDir: `${repoRoot}docs`, github, problems: linkProblems }]],
    }),
  },
  integrations: [
    starlight({
      title: 'BearMinion',
      description: 'Documentation for BearMinion, a git-based CMS for Astro: the editor, the content files, themes and the API.',
      favicon: '/favicon.png',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.bearminion.com/og.png' } },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'BearMinion: a git-based CMS for Astro. Click to edit. Commit to publish.' },
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: github },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/create-bearminion' },
      ],
      // Page paths are relative to this folder (`../../docs/editor.md`), so the base is this folder in the repository.
      editLink: { baseUrl: `${github}/edit/main/apps/docs/` },
      lastUpdated: true,
      customCss: [
        '@fontsource-variable/bricolage-grotesque',
        '@fontsource/instrument-serif/400-italic.css',
        '@fontsource/jetbrains-mono/400.css',
        './src/styles/brand.css',
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
      },
      sidebar: [
        { label: 'Start here', items: ['getting-started'] },
        { label: 'Using BearMinion', items: ['editor', 'content', 'forms', 'cli'] },
        { label: 'Sections', items: [{ autogenerate: { directory: 'sections' } }] },
        { label: 'Building with BearMinion', items: ['themes', 'integration', 'dev-api'] },
      ],
    }),
    // After the build: every internal link and #anchor must exist. starlight-links-validator cannot be used here: it
    // derives page URLs from paths under src/content/docs, and these pages come from the repository's docs/ folder.
    checkLinks({ problems: linkProblems }),
  ],
})
