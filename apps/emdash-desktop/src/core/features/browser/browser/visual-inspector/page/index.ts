/**
 * Visual inspector page script.
 *
 * Bundled into one self-contained IIFE by the `visual-inspector-page-script`
 * Vite plugin and executed into browser webviews on demand. It only wires event
 * listeners while a pick is in flight: no polling, no DOM crawling, and hover
 * work is limited to one hit test per animation frame.
 */
import { getElementAtPoint, getElementBounds, isElementGrabbable } from 'react-grab/primitives';
import {
  VISUAL_INSPECTOR_API_KEY,
  type VisualInspectorPageApi,
  type VisualSelection,
  type VisualSelectionBounds,
} from '../protocol';
import { extractVisualSelection } from './context-extractor';
import { createHighlightOverlay } from './highlight-overlay';

const PAGE_API_VERSION = 1;
const MAX_HOVER_LABEL = 120;

declare global {
  interface Window {
    __EMDASH_VISUAL_INSPECTOR__?: VisualInspectorPageApi;
  }
}

function createVisualInspectorApi(doc: Document): VisualInspectorPageApi {
  const overlay = createHighlightOverlay(doc);
  let active = false;
  let extracting = false;
  let committed = false;
  let hovered: Element | null = null;
  let pendingResolve: ((value: VisualSelection | null) => void) | null = null;
  let frame: number | null = null;
  let point: { x: number; y: number } | null = null;
  let previousCursor: string | null = null;
  let attached = false;

  const onPointerMove = (event: PointerEvent) => {
    if (!active || extracting) return;
    point = { x: event.clientX, y: event.clientY };
    if (frame !== null) return;
    frame = requestAnimationFrame(updateHover);
  };

  const updateHover = () => {
    frame = null;
    if (!active || !point) return;
    const candidate = pickElement(point.x, point.y, doc);
    if (!candidate) {
      hovered = null;
      overlay.hide();
      return;
    }
    if (candidate === hovered && !committed) return;
    hovered = candidate;
    overlay.show(boundsOf(candidate), describeElement(candidate));
  };

  const onPointerDownCapture = (event: Event) => {
    if (!active || extracting) return;
    // Keep the page from focusing, dragging, or activating under the pointer.
    event.preventDefault();
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!active || extracting) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void commit(hovered ?? pickElement(event.clientX, event.clientY, doc));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    stop();
  };

  const onViewportChange = () => {
    if (!active) return;
    hovered = null;
    overlay.hide();
  };

  const onContextMenu = (event: MouseEvent) => {
    if (!active) return;
    // Right click cancels the pick instead of opening the page menu.
    event.preventDefault();
    event.stopPropagation();
    stop();
  };

  const attach = () => {
    if (attached) return;
    attached = true;
    overlay.attach();
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerdown', onPointerDownCapture, true);
    doc.addEventListener('click', onClickCapture, true);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('contextmenu', onContextMenu, true);
    doc.addEventListener('scroll', onViewportChange, true);
    doc.defaultView?.addEventListener('resize', onViewportChange, true);
    previousCursor = doc.documentElement.style.cursor;
    doc.documentElement.style.cursor = 'crosshair';
  };

  const detach = () => {
    if (!attached) return;
    attached = false;
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerdown', onPointerDownCapture, true);
    doc.removeEventListener('click', onClickCapture, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('contextmenu', onContextMenu, true);
    doc.removeEventListener('scroll', onViewportChange, true);
    doc.defaultView?.removeEventListener('resize', onViewportChange, true);
    if (previousCursor !== null) doc.documentElement.style.cursor = previousCursor;
    previousCursor = null;
  };

  const settle = (value: VisualSelection | null) => {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve?.(value);
  };

  const commit = async (candidate: Element | null) => {
    if (!candidate) return;
    extracting = true;
    hovered = candidate;
    committed = true;
    overlay.show(boundsOf(candidate), describeElement(candidate), { committed: true });
    let selection: VisualSelection | null = null;
    try {
      selection = await extractVisualSelection(candidate);
    } catch {
      selection = null;
    }
    extracting = false;
    // Listeners come off before the payload is handed back; the committed box
    // stays drawn until the app clears the selection.
    detach();
    active = false;
    settle(selection);
  };

  const stop = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    point = null;
    extracting = false;
    detach();
    active = false;
    if (!committed) {
      hovered = null;
      overlay.hide();
    }
    committed = false;
    settle(null);
  };

  const clearSelection = () => {
    committed = false;
    hovered = null;
    overlay.hide();
  };

  return {
    version: PAGE_API_VERSION,
    start() {
      if (active) stop();
      clearSelection();
      attach();
      active = true;
      return new Promise<VisualSelection | null>((resolve) => {
        pendingResolve = resolve;
      });
    },
    stop,
    clearSelection,
    isActive: () => active,
    dispose() {
      stop();
      overlay.destroy();
    },
  };
}

function pickElement(x: number, y: number, doc: Document): Element | null {
  try {
    const candidate = getElementAtPoint(x, y, {
      filter: (element) => isElementGrabbable(element) && !isInspectorOverlay(element),
    });
    if (candidate) return candidate;
  } catch {
    // Primitive unavailable or threw; the plain hit test below still works.
  }
  const fallback = doc.elementFromPoint(x, y);
  return fallback && !isInspectorOverlay(fallback) ? fallback : null;
}

function isInspectorOverlay(element: Element): boolean {
  return element.closest?.('#emdash-visual-inspector-overlay') !== null;
}

/** Viewport bounds for the overlay box; spans same-origin iframes when available. */
function boundsOf(element: Element): VisualSelectionBounds {
  try {
    const bounds = getElementBounds(element);
    if (bounds && Number.isFinite(bounds.width) && Number.isFinite(bounds.x)) {
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    }
  } catch {
    // Fall through to the plain rect.
  }
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function describeElement(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const className =
    typeof element.className === 'string' && element.className.trim()
      ? `.${element.className.trim().split(/\s+/)[0]}`
      : '';
  const rect = element.getBoundingClientRect();
  const size = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
  return `${tagName}${id}${className}  ·  ${size}`.slice(0, MAX_HOVER_LABEL);
}

function install(): void {
  const existing = window[VISUAL_INSPECTOR_API_KEY];
  existing?.dispose?.();
  window[VISUAL_INSPECTOR_API_KEY] = createVisualInspectorApi(document);
}

install();
