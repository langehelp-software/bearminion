import { z } from 'zod'
import { addMarkIssues, imageSchema, linkSchema, textMarkSchema, textSchema, toneSchema } from './fields.js'
import { walkLinkIds } from './link-ids.js'
import { marksFromEmphasis, type TextMark } from './marks.js'
import { themeModes, tones, type CountRule, type Option } from './section-options.js'
import { HEX_COLOR } from './theme-colors.js'

const hexColor = z.string().regex(HEX_COLOR, 'Use a #rrggbb color.')

/** Seed colors for the site palette. Absent means the built-in palette. See theme-colors.ts. */
const tokenOverrides = z
  .object({
    bg: hexColor.optional(),
    fg: hexColor.optional(),
    muted: hexColor.optional(),
    surface: hexColor.optional(),
    accent: hexColor.optional(),
    on: hexColor.optional(),
    link: hexColor.optional(),
  })
  .strict()

const toneOverrides = z
  .object({
    base: tokenOverrides.optional(),
    subtle: tokenOverrides.optional(),
    inverse: tokenOverrides.optional(),
    brand: tokenOverrides.optional(),
  })
  .strict()

export const themeColorsSchema = z
  .object({
    brand: hexColor.optional(),
    neutral: hexColor.optional(),
    link: hexColor.optional(),
    /** False keeps `tones` saved but stops applying it. */
    customTones: z.boolean().optional(),
    /** Hand-picked tokens per mode and tone, applied over the derived palette. */
    tones: z.object({ light: toneOverrides.optional(), dark: toneOverrides.optional() }).strict().optional(),
  })
  .strict()

export const themeSchema = z
  .object({
    // `system` was removed. Existing sites that still say so read as light.
    mode: z.preprocess((value) => (value === 'system' ? 'light' : value), z.enum(themeModes).default('light')),
    motion: z.boolean().default(true),
    colors: themeColorsSchema.optional(),
  })
  .strict()

/** Header buttons are a plain list, shown left to right. The last one is the primary button. */
export const DEFAULT_MAX_HEADER_ACTIONS = 2
/** The footer lays out at most this many link columns, aligned to the right edge. */
export const DEFAULT_MAX_FOOTER_COLUMNS = 3

export const footerColumnSchema = z
  .object({
    title: textSchema,
    links: z.array(linkSchema),
  })
  .strict()

interface HeaderParts {
  variants: readonly [string, ...string[]]
  defaultVariant: string
  maxActions: number
}

interface FooterParts {
  variants: readonly [string, ...string[]]
  defaultVariant: string
  maxColumns: number
  badge: boolean
}

function createHeaderSchema({ variants, defaultVariant, maxActions }: HeaderParts) {
  return z
    .object({
      variant: z.enum(variants).default(defaultVariant),
      tone: toneSchema,
      sticky: z.boolean().default(true),
      links: z.array(linkSchema),
      actions: z.array(linkSchema).max(maxActions).optional(),
      /** Legacy: read as `actions` (`signIn` first, then `cta`) and not written back. */
      cta: linkSchema.optional(),
      /** Legacy: see `cta`. */
      signIn: linkSchema.optional(),
    })
    .strict()
    .superRefine((header, ctx) => {
      if (header.actions && (header.cta || header.signIn)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Use either actions or the legacy cta and signIn, not both',
          path: ['actions'],
        })
      }
    })
    .transform(({ cta, signIn, actions, ...rest }) => ({
      ...rest,
      actions: actions ?? [signIn, cta].filter((link): link is NonNullable<typeof link> => link !== undefined),
    }))
}

function createFooterSchema({ variants, defaultVariant, maxColumns, badge }: FooterParts) {
  return z
    .object({
      variant: z.enum(variants).default(defaultVariant),
      tone: toneSchema,
      text: z.string().optional(),
      legal: z.string().optional(),
      /** Pill on the columns variant. Hidden when omitted. Only themes that enable it accept it. */
      badge: z.string().min(1).optional(),
      columns: z.array(footerColumnSchema).max(maxColumns),
    })
    .strict()
    .superRefine((footer, ctx) => {
      if (!badge && footer.badge !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'This site has no footer badge', path: ['badge'] })
      }
    })
}

/** Defaults used when a page does not set its own SEO fields. */
export const siteSeoSchema = z
  .object({
    /** `%s` is replaced with the page SEO title. */
    titleTemplate: z.string().min(1).optional(),
    description: z.string().optional(),
    ogImage: z.string().min(1).optional(),
  })
  .strict()

/**
 * Raw HTML snippets for analytics and similar tags. A theme renders `head` at the end of `<head>` and
 * `bodyEnd` before `</body>`, in production builds only.
 */
export const siteAnalyticsSchema = z
  .object({
    head: z.string().max(20_000).optional(),
    bodyEnd: z.string().max(20_000).optional(),
  })
  .strict()

/** Height range in px. Unset means the wordmark's own height, 28. */
export const BRAND_LOGO_HEIGHT = { min: 16, max: 64, default: 28 } as const

export const brandLogoSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string(),
    height: z.number().int().min(BRAND_LOGO_HEIGHT.min).max(BRAND_LOGO_HEIGHT.max).optional(),
  })
  .strict()

function createSiteSchema(header: HeaderParts, footer: FooterParts) {
  const headerSchema = createHeaderSchema(header)
  const footerSchema = createFooterSchema(footer)
  return z
    .object({
      name: textSchema,
      /**
       * Legacy substring of `name` rendered as a serif italic accent.
       * Parsed sites store the same accent in `nameMarks` and omit this field.
       */
      nameEm: z.string().min(1).optional(),
      /** Inline marks for the wordmark. Same model as a heading. */
      nameMarks: z.array(textMarkSchema).optional(),
      url: z.url(),
      /** The page language as a BCP 47 tag (`en`, `pl`, `pt-BR`), rendered as `<html lang>`. Default `en`. */
      lang: z
        .string()
        .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'Use a language tag such as en, pl or pt-BR')
        .optional(),
      /** The browser tab icon. Read from the legacy `logo` key and stored as `favicon`. */
      favicon: imageSchema.optional(),
      /** Legacy name of `favicon`. */
      logo: imageSchema.optional(),
      /** Image shown in the header and footer in place of the name. */
      brandLogo: brandLogoSchema.optional(),
      seo: siteSeoSchema,
      analytics: siteAnalyticsSchema.optional(),
      theme: themeSchema.default({ mode: 'light', motion: true }),
      header: headerSchema,
      footer: footerSchema,
    })
    .strict()
    .superRefine((site, ctx) => {
      if (site.nameEm !== undefined && !site.name.includes(site.nameEm)) {
        ctx.addIssue({
          code: 'custom',
          message: 'nameEm must be a substring of name',
          path: ['nameEm'],
        })
      }
      addMarkIssues(site.name, site.nameMarks as TextMark[] | undefined, ctx, ['nameMarks'])
      const seen = new Set<string>()
      walkLinkIds(site, [], (id, path) => {
        if (seen.has(id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate link id "${id}"`,
            path,
          })
        }
        seen.add(id)
      })
    })
    .transform((site) => {
      const { nameEm, logo, ...rest } = site
      const explicit = site.nameMarks
      const resolved = explicit && explicit.length > 0 ? explicit : marksFromEmphasis(site.name, nameEm)
      return {
        ...rest,
        favicon: site.favicon ?? logo,
        nameMarks: resolved && resolved.length > 0 ? resolved : undefined,
      }
    })
}

export type Theme = z.infer<typeof themeSchema>
export type FooterColumn = z.infer<typeof footerColumnSchema>
export type SiteSeo = z.infer<typeof siteSeoSchema>
export type SiteAnalytics = z.infer<typeof siteAnalyticsSchema>
type AnySite = z.output<ReturnType<typeof createSiteSchema>>
/** A site with header and footer variants as plain strings. {@link SiteWith} narrows them. */
export type Header = AnySite['header']
export type Footer = AnySite['footer']
export type Site = AnySite

/** A site whose header and footer variants are the unions a {@link SiteDefinition} declares. */
export type SiteWith<THeader extends string, TFooter extends string> = Omit<Site, 'header' | 'footer'> & {
  header: Omit<Header, 'variant'> & { variant: THeader }
  footer: Omit<Footer, 'variant'> & { variant: TFooter }
}

export interface HeaderConfig<TVariants extends readonly [string, ...string[]]> {
  variants: TVariants
  defaultVariant: TVariants[number]
  /** Most buttons the header can hold. Default 2. */
  maxActions?: number
  /** Recommended number of links, shown as guidance in the editor. Default 4. */
  recommendedLinks?: number
}

export interface FooterConfig<TVariants extends readonly [string, ...string[]]> {
  variants: TVariants
  defaultVariant: TVariants[number]
  /** Most link columns the footer can lay out. Default 3. */
  maxColumns?: number
  /** The footer has a pill whose text the editor sets. Default false. */
  badge?: boolean
}

export interface SiteConfig<
  THeaderVariants extends readonly [string, ...string[]],
  TFooterVariants extends readonly [string, ...string[]],
> {
  header: HeaderConfig<THeaderVariants>
  footer: FooterConfig<TFooterVariants>
}

/**
 * The site-level chrome a theme owns: which header and footer layouts exist, how many buttons
 * and columns they hold, and the controls the editor shows for them. Built by {@link defineSite}.
 *
 * The tone names, color modes and palette derivation are the editor's design contract and
 * are not configurable here.
 */
export interface SiteDefinition<THeader extends string = string, TFooter extends string = string> {
  readonly schema: z.ZodType<SiteWith<THeader, TFooter>>
  /** Sidebar controls: color mode and motion, then the header and footer controls. */
  readonly options: readonly Option[]
  /** Item-count guidance and limits for the header and footer lists. */
  readonly counts: { readonly header: Readonly<Record<string, CountRule>>; readonly footer: Readonly<Record<string, CountRule>> }
  readonly limits: { readonly maxHeaderActions: number; readonly maxFooterColumns: number }
  readonly header: { readonly variants: readonly THeader[]; readonly defaultVariant: THeader }
  readonly footer: { readonly variants: readonly TFooter[]; readonly defaultVariant: TFooter; readonly badge: boolean }
}

/** The site type a definition validates to. */
export type SiteOf<TDefinition extends SiteDefinition> = z.output<TDefinition['schema']>

export function defineSite<
  const THeaderVariants extends readonly [string, ...string[]],
  const TFooterVariants extends readonly [string, ...string[]],
>(config: SiteConfig<THeaderVariants, TFooterVariants>): SiteDefinition<THeaderVariants[number], TFooterVariants[number]> {
  const { header, footer } = config
  const maxActions = header.maxActions ?? DEFAULT_MAX_HEADER_ACTIONS
  const maxColumns = footer.maxColumns ?? DEFAULT_MAX_FOOTER_COLUMNS
  const badge = footer.badge === true
  for (const [name, part] of [
    ['header', header],
    ['footer', footer],
  ] as const) {
    if (!(part.variants as readonly string[]).includes(part.defaultVariant)) {
      throw new Error(`defineSite: ${name}.defaultVariant "${part.defaultVariant}" is not in ${name}.variants.`)
    }
  }
  if (!Number.isInteger(maxActions) || maxActions < 1) throw new Error('defineSite: header.maxActions must be a positive integer.')
  if (!Number.isInteger(maxColumns) || maxColumns < 1) throw new Error('defineSite: footer.maxColumns must be a positive integer.')

  const schema = createSiteSchema(
    { variants: header.variants, defaultVariant: header.defaultVariant, maxActions },
    { variants: footer.variants, defaultVariant: footer.defaultVariant, maxColumns, badge },
  ) as unknown as z.ZodType<SiteWith<THeaderVariants[number], TFooterVariants[number]>>

  const options: Option[] = [
    { name: 'lang', label: 'Language', type: 'string', default: 'en' },
    { name: 'theme.mode', label: 'Color mode', type: 'enum', choices: themeModes, default: 'light' },
    { name: 'theme.motion', label: 'Motion', type: 'boolean', default: true },
    { name: 'header.variant', label: 'Header variant', type: 'enum', choices: header.variants, default: header.defaultVariant },
    { name: 'header.tone', label: 'Header tone', type: 'enum', choices: tones, default: 'base' },
    { name: 'header.sticky', label: 'Sticky header', type: 'boolean', default: true },
    { name: 'footer.variant', label: 'Footer variant', type: 'enum', choices: footer.variants, default: footer.defaultVariant },
    { name: 'footer.tone', label: 'Footer tone', type: 'enum', choices: tones, default: 'base' },
    ...(badge ? [{ name: 'footer.badge', label: 'Footer badge', type: 'string', default: '' } as const] : []),
  ]

  return {
    schema,
    options,
    counts: {
      header: { links: { recommended: header.recommendedLinks ?? 4 } },
      footer: { columns: { recommended: maxColumns, max: maxColumns } },
    },
    limits: { maxHeaderActions: maxActions, maxFooterColumns: maxColumns },
    header: { variants: header.variants, defaultVariant: header.defaultVariant },
    footer: { variants: footer.variants, defaultVariant: footer.defaultVariant, badge },
  }
}
