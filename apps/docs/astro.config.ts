import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://docs.bearminion.com',
  integrations: [
    starlight({
      title: 'BearMinion',
      description: 'Documentation for BearMinion, a git-based CMS for Astro: the editor, the content files, themes and the API.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/langehelp-software/bearminion' }],
      // Page paths are relative to this folder (`../../docs/editor.md`), so the base is this folder in the repository.
      editLink: { baseUrl: 'https://github.com/langehelp-software/bearminion/edit/main/apps/docs/' },
      lastUpdated: true,
    }),
  ],
})
