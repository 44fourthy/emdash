import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import pageScript from 'virtual:emdash-visual-inspector-page-script';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VISUAL_INSPECTOR_API_KEY, type VisualInspectorPageApi } from '../protocol';

/**
 * Drives the injected page runtime in a real browser against a real React tree —
 * the same code path Emdash uses when it executes the bundle inside a webview.
 */

function CreateOrderButton({ label }: { label: string }) {
  return <button className="create-order primary">{label}</button>;
}

function OrdersToolbar() {
  return (
    <div className="orders-toolbar">
      <CreateOrderButton label="Create Order" />
      <input type="password" name="password" value="hunter2" readOnly />
    </div>
  );
}

function inspector(): VisualInspectorPageApi {
  const api = (globalThis as Record<string, unknown>)[VISUAL_INSPECTOR_API_KEY];
  if (!api) throw new Error('page runtime did not install');
  return api as VisualInspectorPageApi;
}

/** Runs the bundle in the page's main world, like executeJavaScript does in a webview. */
function installPageScript(): void {
  const script = document.createElement('script');
  script.textContent = pageScript;
  document.head.appendChild(script);
  script.remove();
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}

async function hoverAndClick(element: Element) {
  const point = centreOf(element);
  element.dispatchEvent(
    new PointerEvent('pointermove', { clientX: point.x, clientY: point.y, bubbles: true })
  );
  await nextFrame();
  element.dispatchEvent(
    new MouseEvent('click', {
      clientX: point.x,
      clientY: point.y,
      bubbles: true,
      cancelable: true,
    })
  );
}

describe('visual inspector page runtime', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<OrdersToolbar />);
    });
    installPageScript();
  });

  afterEach(async () => {
    inspector().dispose();
    await act(async () => root.unmount());
    host.remove();
  });

  it('resolves a React element with component metadata and styles', async () => {
    const api = inspector();
    const pending = api.start();
    expect(api.isActive()).toBe(true);

    await hoverAndClick(host.querySelector('button.create-order')!);
    const selection = await pending;

    expect(selection).not.toBeNull();
    expect(selection?.tagName).toBe('button');
    expect(selection?.text).toBe('Create Order');
    expect(selection?.classes).toContain('create-order');
    expect(selection?.selector).toContain('create-order');
    expect(selection?.xpath).toContain('button');
    expect(selection?.styles.display).toBeTruthy();
    expect(selection?.bounds.width).toBeGreaterThan(0);
    expect(selection?.ancestors[0]?.selector).toContain('orders-toolbar');
    expect(api.isActive()).toBe(false);
  });

  it('captures React component identity when available', async () => {
    const pending = inspector().start();
    await hoverAndClick(host.querySelector('button.create-order')!);
    const selection = await pending;

    // React Grab resolves the source location; the fiber walk covers the name,
    // since the inspector is injected after the page already rendered.
    expect(selection?.component.name).toBe('CreateOrderButton');
    expect(selection?.component.stack[0]).toContain('CreateOrderButton');
    expect(selection?.component.stack).toContain('OrdersToolbar');
  });

  it('redacts the value of password inputs and says so', async () => {
    const pending = inspector().start();
    await hoverAndClick(host.querySelector('input[type="password"]')!);
    const selection = await pending;

    expect(selection?.attributes.value).toBe('[redacted]');
    expect(selection?.html).toContain('[redacted]');
    expect(selection?.html).not.toContain('hunter2');
    expect(selection?.redactions).toContain('password-value');
  });

  it('resolves null when the pick is cancelled', async () => {
    const api = inspector();
    const pending = api.start();
    api.stop();

    expect(await pending).toBeNull();
    expect(api.isActive()).toBe(false);
  });

  it('resolves null when Escape is pressed in the page', async () => {
    const api = inspector();
    const pending = api.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(await pending).toBeNull();
    expect(api.isActive()).toBe(false);
  });

  it('reinstalling the script replaces the previous runtime', () => {
    const first = inspector();
    installPageScript();

    expect(inspector()).not.toBe(first);
    expect(inspector().isActive()).toBe(false);
  });
});
