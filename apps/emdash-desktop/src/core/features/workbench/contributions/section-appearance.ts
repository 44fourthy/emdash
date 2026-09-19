import { z } from 'zod';

/**
 * Section colours are stored as stable names rather than raw hex, so a hue can be
 * retuned per theme without rewriting saved state. Each name resolves to
 * `--section-color-<name>` in the renderer theme.
 */
export const sectionColorSchema = z.enum([
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
]);
export type SectionColorName = z.infer<typeof sectionColorSchema>;
export const SECTION_COLOR_NAMES = sectionColorSchema.options;

export const sectionIconSchema = z.enum([
  'folder',
  'star',
  'rocket',
  'bug',
  'flame',
  'zap',
  'target',
  'heart',
]);
export type SectionIconName = z.infer<typeof sectionIconSchema>;
export const SECTION_ICON_NAMES = sectionIconSchema.options;

/** Per-section look. Absent fields mean the default (uncoloured, no icon). */
export const sectionAppearanceSchema = z.object({
  color: sectionColorSchema.optional(),
  icon: sectionIconSchema.optional(),
});
export type SectionAppearance = z.infer<typeof sectionAppearanceSchema>;

export function hasAppearance(appearance: SectionAppearance | undefined): boolean {
  return appearance?.color !== undefined || appearance?.icon !== undefined;
}

/** CSS custom property carrying a palette colour. */
export function sectionColorVar(color: SectionColorName): string {
  return `var(--section-color-${color})`;
}
