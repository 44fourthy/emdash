import '@emdash/ui/style.css';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  VisualAnnotation,
  VisualInspectorState,
} from '@core/features/browser/api/browser/visual-inspector-store';
import type { AgentTarget } from '@core/features/conversations/api/browser/agent-context-bridge';
import type { VisualSelection } from '../visual-inspector/protocol';
import { ElementAnnotationPanel } from './element-annotation-panel';

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

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

const TARGETS: AgentTarget[] = [
  {
    conversationId: 'conversation-1',
    type: 'acp',
    providerId: 'claude',
    label: 'Claude',
    isRunning: true,
  },
];

function state(
  annotations: VisualAnnotation[],
  overrides: Partial<VisualInspectorState> = {}
): VisualInspectorState {
  return { status: 'idle', annotations, error: null, ...overrides };
}

function annotation(overrides: Partial<VisualSelection> = {}, instruction = ''): VisualAnnotation {
  return { id: 'annotation-1', selection: selection(overrides), instruction, createdAt: 1 };
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    state: state([]),
    targets: TARGETS,
    targetId: 'conversation-1',
    sending: false,
    sendError: null,
    onSelectTarget: vi.fn(),
    onInstructionChange: vi.fn(),
    onRemove: vi.fn(),
    onSelectMore: vi.fn(),
    onClear: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  };
}

describe('ElementAnnotationPanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(props: ReturnType<typeof defaultProps>) {
    await act(async () => {
      root.render(<ElementAnnotationPanel {...props} />);
    });
  }

  it('shows the picked element with its source and target agent', async () => {
    await render(defaultProps({ state: state([annotation()]) }));

    expect(host.textContent).toContain('Selected element');
    expect(host.textContent).toContain('CreateOrderButton');
    expect(host.textContent).toContain('src/components/orders/CreateOrderButton.tsx:47:9');
    expect(host.textContent).toContain('Send to');
    expect(host.textContent).toContain('Claude');
  });

  it('keeps Send disabled until an instruction is typed', async () => {
    await render(defaultProps({ state: state([annotation()]) }));
    const send = buttonByText('Send to agent');
    expect(send.disabled).toBe(true);

    await render(defaultProps({ state: state([annotation({}, 'Make this wider.')]) }));
    expect(buttonByText('Send to agent').disabled).toBe(false);
  });

  it('sends the instruction through the provided handler', async () => {
    const props = defaultProps({ state: state([annotation({}, 'Make this wider.')]) });
    await render(props);

    await act(async () => {
      buttonByText('Send to agent').click();
    });

    expect(props.onSend).toHaveBeenCalledTimes(1);
  });

  it('warns when the element context was redacted', async () => {
    await render(
      defaultProps({
        state: state([annotation({ redactions: ['password-value'] })]),
      })
    );

    expect(host.textContent).toContain('Sensitive values redacted');
    expect(host.textContent).toContain('password-value');
  });

  it('asks the user to open a conversation when the task has no agent', async () => {
    await render(defaultProps({ state: state([annotation()]), targets: [], targetId: null }));

    expect(host.textContent).toContain('Open an agent conversation');
    expect(buttonByText('Send to agent').disabled).toBe(true);
  });

  it('shows the picking hint while armed', async () => {
    await render(defaultProps({ state: state([], { status: 'picking' }) }));

    expect(host.textContent).toContain('Click an element in the page');
  });

  it('renders nothing when idle with no selection', async () => {
    await render(defaultProps());
    expect(host.textContent).toBe('');
  });

  function buttonByText(text: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(text)
    );
    if (!match) throw new Error(`No button matching "${text}"`);
    return match as HTMLButtonElement;
  }
});
