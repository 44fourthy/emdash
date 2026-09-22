import { describe, expect, it } from 'vitest';
import type { VisualSelection } from '../../browser/visual-inspector/protocol';
import { buildVisualContextPrompt, hasSendableInstruction } from './visual-inspector-payload';
import type { VisualAnnotation } from './visual-inspector-store';

function selection(overrides: Partial<VisualSelection> = {}): VisualSelection {
  return {
    url: 'http://localhost:3000/orders',
    pageTitle: 'Orders',
    tagName: 'button',
    selector: 'button.create-order',
    xpath: '/html/body/main/button',
    id: 'create-order',
    classes: ['create-order', 'primary'],
    attributes: { type: 'button', 'data-testid': 'create-order' },
    text: 'Create Order',
    html: '<button class="create-order primary" type="button">Create Order</button>',
    styles: { display: 'inline-flex', width: '120px', 'margin-top': '8px' },
    bounds: { x: 820, y: 112, width: 120, height: 36 },
    ancestors: [
      {
        tagName: 'div',
        id: '',
        classes: ['orders-toolbar'],
        selector: 'div.orders-toolbar',
      },
      { tagName: 'main', id: '', classes: ['orders-page'], selector: 'main.orders-page' },
    ],
    siblingIndex: 3,
    siblingCount: 8,
    aria: { role: 'button', label: 'Create order', attributes: { 'aria-expanded': 'false' } },
    component: {
      name: 'CreateOrderButton',
      stack: ['OrdersToolbar (src/components/orders/OrdersToolbar.tsx:12:7)', 'OrdersPage'],
      filePath: 'src/components/orders/CreateOrderButton.tsx',
      lineNumber: 47,
      columnNumber: 19,
    },
    snippet:
      '[<button class="create-order primary">Create Order</button> in CreateOrderButton (at src/components/orders/CreateOrderButton.tsx:47:19)]',
    redactions: [],
    capturedAt: 1,
    ...overrides,
  };
}

function annotation(
  instruction: string,
  overrides: Partial<VisualSelection> = {}
): VisualAnnotation {
  return { id: 'a1', selection: selection(overrides), instruction, createdAt: 1 };
}

describe('buildVisualContextPrompt', () => {
  it('includes the page, element identity, source, styles, and the request', () => {
    const prompt = buildVisualContextPrompt([
      annotation('Make this button wider and align it with the table.'),
    ]);

    expect(prompt).toContain('UI ELEMENT FEEDBACK');
    expect(prompt).toContain('Page: http://localhost:3000/orders');
    expect(prompt).toContain('Selected: CreateOrderButton');
    expect(prompt).toContain('Source: src/components/orders/CreateOrderButton.tsx:47:19');
    expect(prompt).toContain('Component stack:');
    expect(prompt).toContain('Selector: button.create-order');
    expect(prompt).toContain('XPath: /html/body/main/button');
    expect(prompt).toContain('Element: button #create-order .create-order.primary');
    expect(prompt).toContain('Text: "Create Order"');
    expect(prompt).toContain(
      '<button class="create-order primary" type="button">Create Order</button>'
    );
    expect(prompt).toContain('width: 120px;');
    expect(prompt).toContain('Bounding box: x=820 y=112 width=120 height=36');
    expect(prompt).toContain('Container: main.orders-page > div.orders-toolbar (child 3 of 8)');
    expect(prompt).toContain('Accessibility: role=button, aria-label="Create order"');
    expect(prompt).toContain('User request: Make this button wider and align it with the table.');
    expect(prompt).not.toContain('Element 1 of');
  });

  it('falls back to DOM information when no component source is available', () => {
    const prompt = buildVisualContextPrompt([
      annotation('Use the primary style.', {
        component: {
          name: null,
          stack: [],
          filePath: null,
          lineNumber: null,
          columnNumber: null,
        },
        snippet: null,
      }),
    ]);

    expect(prompt).toContain('Selected: button.create-order');
    expect(prompt).not.toContain('Source:');
    expect(prompt).not.toContain('Component stack:');
    expect(prompt).toContain('Selector: button.create-order');
  });

  it('numbers several elements and asks for all of them to be applied', () => {
    const prompt = buildVisualContextPrompt([
      annotation('Reduce the height.', { selector: 'header.app-header' }),
      annotation('Use the primary style.'),
    ]);

    expect(prompt).toContain('=== Element 1 of 2 ===');
    expect(prompt).toContain('=== Element 2 of 2 ===');
    expect(prompt).toContain('User request: Reduce the height.');
    expect(prompt).toContain('Apply every request above.');
  });

  it('reports redactions and empty instructions honestly', () => {
    const prompt = buildVisualContextPrompt([
      annotation('', { redactions: ['password-value', 'sensitive-attribute'] }),
    ]);

    expect(prompt).toContain('Redacted before sending: password-value, sensitive-attribute');
    expect(prompt).toContain('User request: (no instruction provided)');
  });

  it('returns an empty string with nothing selected', () => {
    expect(buildVisualContextPrompt([])).toBe('');
  });
});

describe('hasSendableInstruction', () => {
  it('requires at least one non-blank instruction', () => {
    expect(hasSendableInstruction([])).toBe(false);
    expect(hasSendableInstruction([annotation('   ')])).toBe(false);
    expect(hasSendableInstruction([annotation('  '), annotation('Widen it.')])).toBe(true);
  });
});
