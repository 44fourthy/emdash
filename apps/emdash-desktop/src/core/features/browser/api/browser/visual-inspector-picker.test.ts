import { describe, expect, it, vi } from 'vitest';
import type { VisualSelection } from '../../browser/visual-inspector/protocol';
import { VisualInspectorPicker } from './visual-inspector-picker';
import { VisualInspectorStore } from './visual-inspector-store';

function selection(overrides: Partial<VisualSelection> = {}): VisualSelection {
  return {
    url: 'http://localhost:3000/orders',
    pageTitle: 'Orders',
    tagName: 'button',
    selector: 'button.create-order',
    xpath: '/html/body/button',
    id: '',
    classes: ['create-order'],
    attributes: {},
    text: 'Create Order',
    html: '<button class="create-order">Create Order</button>',
    styles: {},
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    ancestors: [],
    siblingIndex: 1,
    siblingCount: 1,
    aria: { role: null, label: null, attributes: {} },
    component: {
      name: null,
      stack: [],
      filePath: null,
      lineNumber: null,
      columnNumber: null,
    },
    snippet: null,
    redactions: [],
    capturedAt: 1,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('VisualInspectorPicker', () => {
  it('injects the page script and records the picked element', async () => {
    const store = new VisualInspectorStore();
    const runScript = vi.fn(async (_code: string) => selection());
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({ runScript }),
    });

    await picker.startPick();

    const injected = runScript.mock.calls[0]?.[0] ?? '';
    expect(injected).toContain('__EMDASH_VISUAL_INSPECTOR__');
    expect(injected).toContain('.start()');
    expect(store.stateFor('browser-1').status).toBe('idle');
    expect(store.stateFor('browser-1').annotations).toHaveLength(1);
  });

  it('reports a failure when the tab has no live webview yet', async () => {
    const store = new VisualInspectorStore();
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => null,
    });

    await picker.startPick();

    expect(store.stateFor('browser-1').status).toBe('error');
    expect(store.stateFor('browser-1').error).toMatch(/open a page/i);
  });

  it('surfaces script failures to the panel', async () => {
    const store = new VisualInspectorStore();
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({
        runScript: async () => {
          throw new Error('executeJavaScript is not a function');
        },
      }),
    });

    await picker.startPick();

    expect(store.stateFor('browser-1').status).toBe('error');
    expect(store.stateFor('browser-1').error).toBe('executeJavaScript is not a function');
  });

  it('drops a selection that arrives after the user cancelled', async () => {
    const store = new VisualInspectorStore();
    const pending = deferred<unknown>();
    const runScript = vi.fn(async (code: string) => {
      if (code.includes('.start()')) return pending.promise;
      return undefined;
    });
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({ runScript }),
    });

    const started = picker.startPick();
    await picker.cancelPick();
    pending.resolve(selection());
    await started;

    expect(store.stateFor('browser-1').annotations).toHaveLength(0);
    expect(store.stateFor('browser-1').status).toBe('idle');
    expect(runScript.mock.calls.some(([code]) => code.includes('.stop()'))).toBe(true);
  });

  it('toggles: a second click while picking cancels instead of starting over', async () => {
    const store = new VisualInspectorStore();
    const pending = deferred<unknown>();
    const runScript = vi.fn(async (code: string) => {
      if (code.includes('.start()')) return pending.promise;
      return undefined;
    });
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({ runScript }),
    });

    const started = picker.startPick();
    expect(store.stateFor('browser-1').status).toBe('picking');
    await picker.togglePick();
    pending.resolve(null);
    await started;

    expect(runScript.mock.calls.filter(([code]) => code.includes('.start()'))).toHaveLength(1);
    expect(store.stateFor('browser-1').status).toBe('idle');
  });

  it('drops selections and in-flight picks on navigation', async () => {
    const store = new VisualInspectorStore();
    const pending = deferred<unknown>();
    const runScript = vi.fn(async (code: string) => {
      if (code.includes('.start()')) return pending.promise;
      return undefined;
    });
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({ runScript }),
    });

    const first = picker.startPick();
    pending.resolve(selection());
    await first;
    expect(store.stateFor('browser-1').annotations).toHaveLength(1);

    const secondPending = deferred<unknown>();
    runScript.mockImplementation(async (code: string) =>
      code.includes('.start()') ? secondPending.promise : undefined
    );
    const second = picker.startPick();
    picker.handleNavigation();
    secondPending.resolve(selection());
    await second;

    expect(store.stateFor('browser-1').status).toBe('idle');
    expect(store.stateFor('browser-1').annotations).toHaveLength(0);
  });

  it('clears annotations and asks the page to drop the highlight', async () => {
    const store = new VisualInspectorStore();
    const runScript = vi.fn(async (_code: string) => selection());
    const picker = new VisualInspectorPicker({
      browserId: 'browser-1',
      store,
      getRunner: () => ({ runScript }),
    });

    await picker.startPick();
    await picker.clearAnnotations();

    expect(store.stateFor('browser-1').annotations).toHaveLength(0);
    expect(runScript.mock.calls.some(([code]) => code.includes('.clearSelection()'))).toBe(true);
  });
});
