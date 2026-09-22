/**
 * Hover/selection highlight drawn by the inspector inside the inspected page.
 *
 * Lives in a closed shadow root so page CSS cannot restyle it, is pointer-events
 * none so hit testing never returns it, and is tagged `data-react-grab-ignore` so
 * React Grab's own hit testing skips it too.
 */
import type { VisualSelectionBounds } from '../protocol';

const HOST_ATTRIBUTE = 'data-react-grab-ignore';
const HOST_STYLE_ID = 'emdash-visual-inspector-overlay';

const OVERLAY_STYLES = `
  :host { all: initial; }
  .box {
    position: fixed;
    pointer-events: none;
    box-sizing: border-box;
    border: 1px solid #6366f1;
    background: rgba(99, 102, 241, 0.14);
    border-radius: 2px;
  }
  .box[data-committed='true'] { background: rgba(99, 102, 241, 0.08); }
  .label, .hint {
    position: fixed;
    pointer-events: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 16px;
    color: #f4f4f5;
    background: #18181b;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 2px 6px;
    max-width: 420px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint { font-family: ui-sans-serif, system-ui, sans-serif; color: #d4d4d8; }
  [hidden] { display: none; }
`;

export type HighlightOverlay = {
  attach(): void;
  show(bounds: VisualSelectionBounds, label: string, options?: { committed?: boolean }): void;
  hide(): void;
  destroy(): void;
};

export function createHighlightOverlay(doc: Document): HighlightOverlay {
  let host: HTMLDivElement | null = null;
  let box: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let hint: HTMLDivElement | null = null;

  const attach = () => {
    if (host?.isConnected) return;
    host = doc.createElement('div');
    host.id = HOST_STYLE_ID;
    host.setAttribute(HOST_ATTRIBUTE, '');
    host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = OVERLAY_STYLES;
    box = doc.createElement('div');
    box.className = 'box';
    box.hidden = true;
    label = doc.createElement('div');
    label.className = 'label';
    label.hidden = true;
    hint = doc.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Click an element to attach it to your message · Esc to cancel';
    hint.hidden = true;
    shadow.append(style, box, label, hint);
    doc.documentElement.appendChild(host);
  };

  const show = (
    bounds: VisualSelectionBounds,
    labelText: string,
    options: { committed?: boolean } = {}
  ) => {
    if (!box || !label || !hint || !host?.isConnected) return;
    box.hidden = false;
    box.dataset.committed = options.committed ? 'true' : 'false';
    box.style.left = `${bounds.x}px`;
    box.style.top = `${bounds.y}px`;
    box.style.width = `${bounds.width}px`;
    box.style.height = `${bounds.height}px`;

    label.hidden = labelText.length === 0;
    label.textContent = labelText;
    const labelHeight = 20;
    const above = bounds.y - labelHeight - 4;
    label.style.left = `${Math.max(4, bounds.x)}px`;
    label.style.top = `${above >= 4 ? above : bounds.y + bounds.height + 4}px`;

    hint.hidden = Boolean(options.committed);
    if (!hint.hidden) {
      hint.style.left = '50%';
      hint.style.bottom = '16px';
      hint.style.transform = 'translateX(-50%)';
    }
  };

  const hide = () => {
    if (box) box.hidden = true;
    if (label) label.hidden = true;
    if (hint) hint.hidden = true;
  };

  const destroy = () => {
    host?.remove();
    host = null;
    box = null;
    label = null;
    hint = null;
  };

  return { attach, show, hide, destroy };
}
