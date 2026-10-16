/**
 * `bearminion`: the content model. Schemas, `define*` helpers, marks and the theme palette. Nothing here imports
 * Node or Astro internals, so theme components, client scripts and the editor overlay can all use it.
 * The Astro integration, the content store and the build-time loaders are in `bearminion/astro`.
 */
export { defineSection } from './define-section.js'
export type { SectionConfig, SectionDefinition } from './define-section.js'
export { defineWireframe, wireKinds, wireframeIssues } from './wireframe.js'
export type { WireKind, WireRect, Wireframe } from './wireframe.js'
export type { OptionalContent } from './section-optional.js'

export { ContentError, ContentReadError, ContentValidationError } from './errors.js'
export type { ContentIssue } from './errors.js'

export {
  MAX_NAV_DEPTH,
  htmlIdSchema,
  imageSchema,
  linkSchema,
  richTextSchema,
  textMarkSchema,
  textSchema,
  toneSchema,
  trackingIdSchema,
  withEmphasis,
} from './fields.js'
export {
  DEFAULT_IMAGE_FIT,
  DEFAULT_IMAGE_POSITION,
  IMAGE_FITS,
  IMAGE_POSITIONS,
  isImageFit,
  isImagePosition,
} from './image-layout.js'
export type { ImageFit, ImagePosition } from './image-layout.js'
export type {
  ButtonStyle,
  Image,
  Link,
  RichText,
  Text,
  TextMark,
  Tone,
} from './fields.js'

export {
  applyTextMark,
  fontMarks,
  markClass,
  marksFromEmphasis,
  reconcileMarks,
  renderMarkedHtml,
  splitMarkedText,
  weightMarks,
} from './marks.js'
export type { FontMark, TextRun, WeightMark } from './marks.js'

export { defaultTheme, defineTheme } from './theme.js'
export type { ThemeConfig, ThemeDefinition, ThemeFont } from './theme.js'

export { defineThemePreview } from './preview.js'
export type { SitePreviewHtml, ThemePreview } from './preview.js'

export { API_PREFIX } from './model.js'
export type { ContentModel, SectionRegistry } from './model.js'

export { withoutOrphanSections } from './page.js'
export { SCHEMA_VERSION_KEY, createMigrator } from './migrate.js'
export type { ContentMigration, ContentMigrator, ContentVersioning, DocumentKind } from './migrate.js'

export type * from './api-types.js'

export { SYSTEM_PAGES, createPageSchema, isSystemPage, seoSchema } from './page.js'
export type { Page, Seo } from './page.js'

export {
  buttonStyles,
  motionOption,
  themeModes,
  toneOption,
  tones,
  variantOption,
} from './section-options.js'
export type {
  BooleanOption,
  CountRule,
  EnumOption,
  NumberOption,
  Option,
  StringOption,
} from './section-options.js'

export { anchorSchema, createSectionSchema, sectionIdSchema } from './section-schema.js'
export type { BaseSection, PropsOf, SectionOf } from './section-schema.js'

export {
  BRAND_LOGO_HEIGHT,
  DEFAULT_MAX_FOOTER_COLUMNS,
  DEFAULT_MAX_HEADER_ACTIONS,
  brandLogoSchema,
  defineSite,
  siteSeoSchema,
  themeColorsSchema,
  themeSchema,
} from './site.js'
export {
  HEX_COLOR,
  contrastChecks,
  contrastRatio,
  derivePalette,
  hasOverrides,
  hasThemeColors,
  hexToToken,
  themeCss,
  tokenToHex,
  type ContrastCheck,
  type ThemeColors,
} from './theme-colors.js'
export type {
  Footer,
  FooterColumn,
  FooterConfig,
  Header,
  HeaderConfig,
  Site,
  SiteConfig,
  SiteDefinition,
  SiteOf,
  SiteSeo,
  SiteWith,
  Theme,
} from './site.js'
