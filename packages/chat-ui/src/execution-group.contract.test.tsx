import { afterEach, describe, expect, it } from 'vitest';
import { createChatContext } from '@/chat-context';
import { createChatView } from '@/chat-view';
import type { TranscriptTurn } from '@/model';
import { createChatState } from '@/state/chat-state';

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function mountGroupedTurn() {
  const context = createChatContext();
  const state = createChatState(context);
  const turn: TranscriptTurn = {
    id: 'turn-1',
    seq: 0,
    initiator: 'user',
    outcome: { kind: 'done' },
    items: [
      { kind: 'message', id: 'user-1', seq: 0, role: 'user', text: 'Please inspect this.' },
      {
        kind: 'thinking',
        id: 'thinking-1',
        seq: 1,
        segmentId: 'segment-1',
        status: 'done',
        text: 'I inspected the implementation details.',
        startedAt: 1,
        durationMs: 1200,
      },
      {
        kind: 'message',
        id: 'answer-1',
        seq: 2,
        role: 'assistant',
        text: 'The final answer remains visible.',
      },
    ],
  };
  state.transcript.history.seed([turn]);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:400px;';
  document.body.appendChild(host);
  const view = createChatView({ context, state, parent: host, groupTurnActivity: true });

  cleanups.push(() => {
    view.dispose();
    state.dispose();
    context.dispose();
    host.remove();
  });

  await nextPaint();
  const header = host.querySelector<HTMLElement>('[data-collapse-id="turn-1:execution"]');
  if (!header) throw new Error('Execution group header did not render');
  return { header, host };
}

async function mountLiveGroupedTurn() {
  const context = createChatContext();
  const state = createChatState(context);
  const turn: TranscriptTurn = {
    id: 'turn-live',
    seq: 0,
    initiator: 'user',
    items: [
      { kind: 'message', id: 'user-live', seq: 0, role: 'user', text: 'Inspect this.' },
      {
        kind: 'thinking',
        id: 'thinking-live',
        seq: 1,
        segmentId: 'segment-live',
        status: 'thinking',
        text: 'Inspecting the implementation.',
        startedAt: 1,
      },
    ],
  };
  state.transcript.activeTurn.set(turn, 'generating');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:400px;';
  document.body.appendChild(host);
  const view = createChatView({ context, state, parent: host, groupTurnActivity: true });

  cleanups.push(() => {
    view.dispose();
    state.dispose();
    context.dispose();
    host.remove();
  });

  await nextPaint();
  const header = host.querySelector<HTMLElement>('[data-collapse-id="turn-live:execution:hide"]');
  if (!header) throw new Error('Live execution group header did not render');
  return { header, host, state, turn };
}

describe('execution group contract', () => {
  it('collapses all intermediate work while leaving the final answer visible', async () => {
    const { header, host } = await mountGroupedTurn();

    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toContain('Done');
    expect(header.textContent).toContain('1 step');
    expect(host.textContent).toContain('The final answer remains visible.');
    expect(host.querySelector('[data-collapse-id="thinking-1"]')).toBeNull();
    expect(host.textContent).not.toContain('I inspected the implementation details.');
  });

  it('reveals all work with one click and preserves each inner disclosure', async () => {
    const { header, host } = await mountGroupedTurn();

    header.click();
    await nextPaint();

    const thought = host.querySelector<HTMLElement>('[data-collapse-id="thinking-1"]');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(thought?.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('I inspected the implementation details.');

    thought?.click();
    await nextPaint();
    expect(host.textContent).toContain('I inspected the implementation details.');

    header.click();
    await nextPaint();
    expect(host.querySelector('[data-collapse-id="thinking-1"]')).toBeNull();
    expect(host.textContent).toContain('The final answer remains visible.');
  });

  it('anchors a live disclosure by its stable group id as the turn settles', async () => {
    const { header, host, state, turn } = await mountLiveGroupedTurn();

    expect(header.getAttribute('aria-expanded')).toBe('true');
    header.click();
    expect(state.scroll.get()).toMatchObject({
      kind: 'anchor',
      itemId: 'turn-live:execution',
      edge: 'top',
    });

    state.transcript.activeTurn.set(
      {
        ...turn,
        items: [
          turn.items[0],
          {
            kind: 'thinking',
            id: 'thinking-live',
            seq: 1,
            segmentId: 'segment-live',
            status: 'done',
            text: 'Inspecting the implementation.',
            startedAt: 1,
            durationMs: 800,
          },
          {
            kind: 'message',
            id: 'answer-live',
            seq: 2,
            role: 'assistant',
            text: 'Inspection complete.',
          },
        ],
      },
      'generating'
    );
    await nextPaint();

    const settledHeader = host.querySelector<HTMLElement>(
      '[data-collapse-id="turn-live:execution"]'
    );
    expect(settledHeader?.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).toContain('Inspection complete.');
    expect(state.scroll.get()).toMatchObject({
      kind: 'anchor',
      itemId: 'turn-live:execution',
      edge: 'top',
    });
  });
});
