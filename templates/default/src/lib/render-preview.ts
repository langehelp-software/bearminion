import { defineThemePreview } from 'bearminion'
import { experimental_AstroContainer } from 'astro/container'
import Footer from '../components/organisms/Footer.astro'
import Header from '../components/organisms/Header.astro'
import SectionList from '../components/sections/SectionList.astro'
import type { contentModel } from './content-model'

let container: Promise<experimental_AstroContainer> | undefined
const getContainer = () => (container ??= experimental_AstroContainer.create())

/**
 * How the dev editor renders drafts. Called only from the dev preview endpoints; it does not read or
 * write content files. The model type gives `sections` and `site` their types.
 */
export default defineThemePreview<typeof contentModel>({
  async page({ sections, motion }) {
    return (await getContainer()).renderToString(SectionList, { props: { sections, motion } })
  },

  /** The header and footer of a draft site, so brand, layout and links update without a reload. */
  async site({ site, pathname }) {
    const instance = await getContainer()
    const [header, footer] = await Promise.all([
      instance.renderToString(Header, { props: { site, pathname } }),
      instance.renderToString(Footer, { props: { site } }),
    ])
    return { header, footer }
  },
})
