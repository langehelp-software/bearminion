import { defineSite, type SiteOf } from 'bearminion'

/**
 * The site chrome of this theme: the header and footer layouts, how many buttons and columns they
 * hold, whether the footer has a badge, and whether it has a "Powered by BearMinion" link. The editor builds its Header and Footer tabs from this,
 * and `site.json` is validated against it. Header.astro and Footer.astro render each variant.
 *
 * It holds no `.astro` imports, so `astro.config.ts` and the editor can load it.
 */
export const siteDefinition = defineSite({
  header: {
    variants: ['bar', 'centered', 'floating'],
    defaultVariant: 'bar',
    maxActions: 2,
    recommendedLinks: 4,
  },
  footer: {
    variants: ['simple', 'columns', 'wordmark'],
    defaultVariant: 'columns',
    maxColumns: 3,
    badge: true,
    // The footer's "Powered by BearMinion" link. The Footer tab can switch it off; remove this line to drop the option.
    poweredBy: true,
  },
})

export type Site = SiteOf<typeof siteDefinition>

export const headerVariants = siteDefinition.header.variants
export const footerVariants = siteDefinition.footer.variants
