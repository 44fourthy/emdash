/**
 * Builds the sanitized context payload for a selected element.
 *
 * React Grab primitives do the hard part (stable selector across shadow roots and
 * same-origin iframes, viewport bounds, component/source resolution); everything
 * here degrades gracefully so plain HTML pages still produce a useful payload.
 */
import { getElementBounds, getElementContext, getElementSelector } from 'react-grab/primitives';
import {
  VISUAL_SELECTION_LIMITS,
  type VisualSelection,
  type VisualSelectionComponent,
  type VisualSelectionNode,
  type VisualSelectionRedaction,
} from '../protocol';
import { readFiberMetadata } from './react-fiber-metadata';
import { isPasswordElement, redactMarkup, sanitizeAttributes, sanitizeText } from './sanitizer';

const REACT_GRAB_TIMEOUT_MS = 1_500;
const MAX_XPATH_DEPTH = 12;
const MAX_ANCESTOR_CLASSES = 3;

/** Layout/appearance properties worth handing to an agent. */
const STYLE_PROPERTIES = [
  'display',
  'position',
  'width',
  'height',
  'min-width',
  'max-width',
  'margin',
  'padding',
  'gap',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'grid-template-columns',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'color',
  'background-color',
  'border',
  'border-radius',
  'box-shadow',
  'opacity',
  'overflow',
  'z-index',
] as const;

type ReactGrabContext = Awaited<ReturnType<typeof getElementContext>>;

export async function extractVisualSelection(element: Element): Promise<VisualSelection> {
  const passwordField = isPasswordElement(element);
  const redactions = new Set<VisualSelectionRedaction>();
  if (passwordField) redactions.add('password-value');

  const sanitized = sanitizeAttributes(
    Array.from(element.attributes, (attribute) => [attribute.name, attribute.value] as const).slice(
      0,
      VISUAL_SELECTION_LIMITS.attributes
    ),
    { passwordField, maxValueLength: VISUAL_SELECTION_LIMITS.attrValue }
  );
  if (sanitized.redactions) redactions.add('sensitive-attribute');

  const reactGrab = await readReactGrabContext(element);
  const snippet = reactGrab?.snippet
    ? redactMarkup(reactGrab.snippet, { passwordField }).slice(0, VISUAL_SELECTION_LIMITS.snippet)
    : null;
  if (snippet !== null && snippet !== reactGrab?.snippet) redactions.add('sensitive-text');

  return {
    url: safeLocationHref(element),
    pageTitle: element.ownerDocument?.title ?? '',
    tagName: element.tagName.toLowerCase(),
    selector: resolveSelector(element, reactGrab),
    xpath: buildXPath(element),
    id: element.id ?? '',
    classes: Array.from(element.classList),
    attributes: sanitized.attributes,
    text: sanitizeText(collapseWhitespace(element.textContent ?? ''), { passwordField }).slice(
      0,
      VISUAL_SELECTION_LIMITS.text
    ),
    html: redactMarkup(element.outerHTML ?? '', { passwordField }).slice(
      0,
      VISUAL_SELECTION_LIMITS.html
    ),
    styles: collectStyles(element),
    bounds: collectBounds(element),
    ancestors: collectAncestors(element),
    siblingIndex: siblingIndex(element),
    siblingCount: siblingCount(element),
    aria: collectAria(element),
    component: collectComponent(element, reactGrab),
    snippet,
    redactions: Array.from(redactions),
    capturedAt: Date.now(),
  };
}

async function readReactGrabContext(element: Element): Promise<ReactGrabContext | null> {
  try {
    return await withTimeout(getElementContext(element), REACT_GRAB_TIMEOUT_MS);
  } catch {
    // Source/component metadata is an enhancement: plain HTML pages land here.
    return null;
  }
}

function collectComponent(
  element: Element,
  context: ReactGrabContext | null
): VisualSelectionComponent {
  const stack = (context?.stack ?? [])
    .slice(0, VISUAL_SELECTION_LIMITS.componentStack)
    .map(describeFrame)
    .filter((entry): entry is string => entry !== null);
  // React Grab only sees renderers registered after its hook installed, so fall
  // back to the fiber React attaches to the element itself.
  const fiber = stack.length === 0 || !context?.componentName ? readFiberMetadata(element) : null;
  return {
    name: context?.componentName ?? fiber?.name ?? null,
    stack:
      stack.length > 0
        ? stack
        : (fiber?.stack ?? []).slice(0, VISUAL_SELECTION_LIMITS.componentStack),
    filePath: context?.filePath ?? null,
    lineNumber: context?.lineNumber ?? null,
    columnNumber: context?.columnNumber ?? null,
  };
}

function describeFrame(frame: NonNullable<ReactGrabContext>['stack'][number]): string | null {
  const name = frame.functionName ?? frame.source ?? null;
  if (!name) return null;
  if (!frame.fileName) return name;
  const location = [frame.fileName, frame.lineNumber, frame.columnNumber]
    .filter((part) => part !== undefined && part !== null)
    .join(':');
  return `${name} (${location})`;
}

function collectStyles(element: Element): Record<string, string> {
  const view = element.ownerDocument?.defaultView;
  if (!view) return {};
  const computed = view.getComputedStyle(element);
  const styles: Record<string, string> = {};
  let budget = VISUAL_SELECTION_LIMITS.styles;
  for (const property of STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (!value || value === 'none' || value === 'normal' || value === 'auto') continue;
    if (budget - value.length <= 0) break;
    styles[property] = value;
    budget -= property.length + value.length;
  }
  return styles;
}

function collectBounds(element: Element): VisualSelection['bounds'] {
  try {
    const bounds = getElementBounds(element);
    if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.width)) {
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }
  } catch {
    // Fall through to the local rect.
  }
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function collectAncestors(element: Element): VisualSelectionNode[] {
  const ancestors: VisualSelectionNode[] = [];
  let current = parentOf(element);
  while (current && ancestors.length < VISUAL_SELECTION_LIMITS.ancestors) {
    ancestors.push({
      tagName: current.tagName.toLowerCase(),
      id: current.id ?? '',
      classes: Array.from(current.classList).slice(0, MAX_ANCESTOR_CLASSES),
      selector: simpleSelector(current),
    });
    if (current === current.ownerDocument?.documentElement) break;
    current = parentOf(current);
  }
  return ancestors;
}

function parentOf(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode?.();
  return root && root !== element.ownerDocument && 'host' in root
    ? ((root as ShadowRoot).host ?? null)
    : null;
}

function collectAria(element: Element): VisualSelection['aria'] {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (!attribute.name.startsWith('aria-')) continue;
    attributes[attribute.name] = attribute.value.slice(0, VISUAL_SELECTION_LIMITS.attrValue);
  }
  return {
    role: element.getAttribute('role'),
    label: element.getAttribute('aria-label'),
    attributes,
  };
}

function resolveSelector(element: Element, context: ReactGrabContext | null): string {
  const fromContext = context?.selector ?? null;
  if (fromContext) return fromContext;
  try {
    return getElementSelector(element);
  } catch {
    return simpleSelector(element);
  }
}

function simpleSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = Array.from(element.classList)
    .slice(0, MAX_ANCESTOR_CLASSES)
    .map((name) => `.${name}`)
    .join('');
  return `${tagName}${id}${classes}`;
}

function buildXPath(element: Element): string {
  const id = element.id;
  if (id && !id.includes('"')) return `//*[@id="${id}"]`;

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && parts.length < MAX_XPATH_DEPTH) {
    const parent = parentOf(current);
    if (!parent) {
      parts.unshift(current.tagName.toLowerCase());
      break;
    }
    const tagName = current.tagName.toLowerCase();
    const sameTag = Array.from(parent.children).filter(
      (child) => child.tagName.toLowerCase() === tagName
    );
    const index = sameTag.indexOf(current) + 1;
    parts.unshift(sameTag.length > 1 ? `${tagName}[${index}]` : tagName);
    current = parent;
  }
  return `/${parts.join('/')}`;
}

function siblingIndex(element: Element): number | null {
  const parent = parentOf(element);
  if (!parent) return null;
  return Array.from(parent.children).indexOf(element) + 1 || null;
}

function siblingCount(element: Element): number | null {
  return parentOf(element)?.children.length ?? null;
}

function safeLocationHref(element: Element): string {
  try {
    return element.ownerDocument?.location?.href ?? '';
  } catch {
    return '';
  }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}
