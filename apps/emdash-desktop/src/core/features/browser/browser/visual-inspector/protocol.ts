/**
 * Contract shared by the app and the visual-inspector page script injected into
 * browser webviews. Dependency-free on purpose: the page script is bundled on
 * its own and must not pull app modules into the guest page.
 */

export const VISUAL_INSPECTOR_API_KEY = '__EMDASH_VISUAL_INSPECTOR__';

/** Payload caps; the selection travels back over executeJavaScript serialization. */
export const VISUAL_SELECTION_LIMITS = {
  text: 400,
  html: 2_000,
  snippet: 1_500,
  attrValue: 200,
  styles: 3_000,
  componentStack: 8,
  ancestors: 5,
  attributes: 40,
} as const;

export type VisualSelectionBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualSelectionNode = {
  tagName: string;
  id: string;
  classes: string[];
  selector: string;
};

export type VisualSelectionComponent = {
  name: string | null;
  stack: string[];
  filePath: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
};

/** Why a field was masked, so the panel can explain the redaction honestly. */
export type VisualSelectionRedaction = 'password-value' | 'sensitive-attribute' | 'sensitive-text';

export type VisualSelection = {
  url: string;
  pageTitle: string;
  tagName: string;
  selector: string;
  xpath: string;
  id: string;
  classes: string[];
  attributes: Record<string, string>;
  text: string;
  html: string;
  styles: Record<string, string>;
  bounds: VisualSelectionBounds;
  ancestors: VisualSelectionNode[];
  /** Position among same-parent children, useful for layout instructions. */
  siblingIndex: number | null;
  siblingCount: number | null;
  aria: {
    role: string | null;
    label: string | null;
    attributes: Record<string, string>;
  };
  component: VisualSelectionComponent;
  /** React Grab's formatted element snippet, already sanitized. */
  snippet: string | null;
  redactions: VisualSelectionRedaction[];
  capturedAt: number;
};

/**
 * Shape exposed on `globalThis` inside the inspected page. The app calls
 * `start()` and receives the selection, or `null` when picking is cancelled.
 */
export type VisualInspectorPageApi = {
  version: number;
  start(): Promise<VisualSelection | null>;
  stop(): void;
  /** Removes the committed highlight without touching an in-flight pick. */
  clearSelection(): void;
  isActive(): boolean;
  dispose(): void;
};

export function isVisualSelection(value: unknown): value is VisualSelection {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VisualSelection>;
  return (
    typeof candidate.tagName === 'string' &&
    typeof candidate.selector === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.html === 'string' &&
    typeof candidate.bounds === 'object' &&
    candidate.bounds !== null &&
    typeof candidate.component === 'object' &&
    candidate.component !== null
  );
}
