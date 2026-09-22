/**
 * Thin helpers around pretext's `prepareRichInline`.
 *
 * The per-instance richInlineCache has moved to ChatCaches (core/caches.ts).
 * This module now exports:
 *   registerFontsReadyClear  — font-load hook; calls onCleared which should
 *                              invoke caches.clearTextMeasure() + remeasure.
 *   clearPretextInternalCaches — flush pretext's internal global caches (re-exported
 *                               for use from ChatCaches.clearTextMeasure).
 */

import type { FontConfig, VariantMetrics } from '../config';

export { clearCache as clearPretextInternalCaches } from '@chenglou/pretext';

function fontLoadSpecs(fonts: FontConfig): string[] {
  const variants: VariantMetrics[] = [
    fonts.body,
    fonts.bold,
    fonts.italic,
    fonts.boldItalic,
    fonts.link,
    fonts.h1,
    fonts.h2,
    fonts.h3,
    fonts.inlineCode,
    fonts.mention,
    fonts.code,
  ];
  return [...new Set(variants.map((variant) => variant.font))];
}

/**
 * Eagerly load the bundled named fonts, then call `onCleared`
 * (which should invoke `caches.clearTextMeasure()` + `virtualizer.measure()`).
 *
 * Using `document.fonts.load(spec)` instead of `document.fonts.ready` ensures
 * we wait for the exact faces pretext needs, not just "all fonts document-wide".
 * Without this, pretext measures with the fallback metrics during first paint
 * and produces wrong line-break positions until the cache is cleared.
 *
 * Call this once when ChatTranscript mounts.
 */
export function registerFontsReadyClear(fonts: FontConfig, onCleared?: () => void): void {
  if (typeof document === 'undefined') return;
  void Promise.all(fontLoadSpecs(fonts).map((spec) => document.fonts.load(spec))).then(() => {
    onCleared?.();
  });
}
