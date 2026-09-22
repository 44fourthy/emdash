import { describe, expect, it } from 'vitest';
import type { VisualSelection } from '../../browser/visual-inspector/protocol';
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
    styles: { width: '120px' },
    bounds: { x: 10, y: 20, width: 120, height: 32 },
    ancestors: [],
    siblingIndex: 1,
    siblingCount: 1,
    aria: { role: null, label: null, attributes: {} },
    component: {
      name: 'CreateOrderButton',
      stack: [],
      filePath: 'src/components/orders/CreateOrderButton.tsx',
      lineNumber: 47,
      columnNumber: 9,
    },
    snippet: null,
    redactions: [],
    capturedAt: 1,
    ...overrides,
  };
}

describe('VisualInspectorStore', () => {
  it('starts idle with no annotations', () => {
    const store = new VisualInspectorStore();
    expect(store.stateFor('browser-1')).toEqual({
      status: 'idle',
      annotations: [],
      error: null,
    });
  });

  it('tracks picking state and records the picked element as an annotation', () => {
    const store = new VisualInspectorStore();
    store.beginPicking('browser-1');
    expect(store.stateFor('browser-1').status).toBe('picking');

    const annotation = store.finishPicking('browser-1', selection());
    expect(annotation).not.toBeNull();
    expect(store.stateFor('browser-1').status).toBe('idle');
    expect(store.stateFor('browser-1').annotations).toHaveLength(1);
    expect(store.stateFor('browser-1').annotations[0]?.instruction).toBe('');
  });

  it('keeps annotations when a pick is cancelled', () => {
    const store = new VisualInspectorStore();
    store.beginPicking('browser-1');
    store.finishPicking('browser-1', selection());
    store.beginPicking('browser-1');
    store.finishPicking('browser-1', null);

    expect(store.stateFor('browser-1').status).toBe('idle');
    expect(store.stateFor('browser-1').annotations).toHaveLength(1);
  });

  it('supports several annotations with their own instructions', () => {
    const store = new VisualInspectorStore();
    store.finishPicking('browser-1', selection());
    store.finishPicking('browser-1', selection({ selector: 'aside.sidebar' }));
    const [first, second] = store.stateFor('browser-1').annotations;

    store.setInstruction('browser-1', first!.id, 'Reduce the height.');
    store.setInstruction('browser-1', second!.id, 'Make this narrower.');

    expect(store.stateFor('browser-1').annotations.map((a) => a.instruction)).toEqual([
      'Reduce the height.',
      'Make this narrower.',
    ]);
  });

  it('removes a single annotation and clears the rest', () => {
    const store = new VisualInspectorStore();
    store.finishPicking('browser-1', selection());
    const second = store.finishPicking('browser-1', selection({ selector: 'aside.sidebar' }))!;

    store.removeAnnotation('browser-1', second.id);
    expect(store.stateFor('browser-1').annotations).toHaveLength(1);

    store.clearAnnotations('browser-1');
    expect(store.stateFor('browser-1').annotations).toHaveLength(0);
  });

  it('isolates state per browser tab', () => {
    const store = new VisualInspectorStore();
    store.finishPicking('browser-1', selection());
    expect(store.stateFor('browser-2').annotations).toHaveLength(0);

    store.clearBrowser('browser-1');
    expect(store.stateFor('browser-1').annotations).toHaveLength(0);
  });

  it('records picker failures', () => {
    const store = new VisualInspectorStore();
    store.fail('browser-1', 'Execute JavaScript is unavailable');
    expect(store.stateFor('browser-1')).toMatchObject({
      status: 'error',
      error: 'Execute JavaScript is unavailable',
    });
  });
});
