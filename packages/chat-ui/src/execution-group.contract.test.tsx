import { afterEach, describe, expect, it } from 'vitest';
import { createChatContext } from '@/chat-context';
import { createChatView } from '@/chat-view';
import type { TranscriptTurn } from '@/model';
import { createChatState } from '@/state/chat-state';

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function visibleRows(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('[data-chat-canvas] > [data-index]')).sort(
    (a, b) => Number(a.dataset.index) - Number(b.dataset.index)
  );
}

function rowGeometry(host: HTMLElement): string {
  return visibleRows(host)
    .map((row) => {
      const rect = row.getBoundingClientRect();
      return `${row.dataset.index}:${rect.top.toFixed(2)}:${rect.bottom.toFixed(2)}`;
    })
    .join('|');
}

async function waitForStableGeometry(host: HTMLElement): Promise<void> {
  let previous = '';
  let stableFrames = 0;
  for (let frame = 0; frame < 90; frame++) {
    await nextFrame();
    const current = rowGeometry(host);
    stableFrames = current === previous ? stableFrames + 1 : 0;
    if (stableFrames >= 2) return;
    previous = current;
  }
  throw new Error('Chat row geometry did not settle');
}

function expectRowsToTile(host: HTMLElement): void {
  const rows = visibleRows(host);
  expect(rows.length).toBeGreaterThan(1);
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1];
    const current = rows[index];
    expect(Number(current.dataset.index)).toBe(Number(previous.dataset.index) + 1);
    const gap = current.getBoundingClientRect().top - previous.getBoundingClientRect().bottom;
    expect(Math.abs(gap)).toBeLessThan(0.75);
  }
}

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
  const header = host.querySelector<HTMLElement>('[data-collapse-id="turn-live:execution"]');
  if (!header) throw new Error('Live execution group header did not render');
  return { header, host, state, turn };
}

async function mountReindexedConversation() {
  const context = createChatContext();
  const state = createChatState(context);
  const activity: TranscriptTurn['items'] = Array.from({ length: 28 }, (_, index) =>
    index % 2 === 0
      ? {
          kind: 'thinking' as const,
          id: `thinking-reindex-${index}`,
          seq: index + 1,
          segmentId: `segment-reindex-${index}`,
          status: 'done' as const,
          text: `Completed investigation step ${index + 1}.`,
          startedAt: index + 1,
          durationMs: 700 + index * 100,
        }
      : {
          kind: 'read-tool-call' as const,
          id: `read-reindex-${index}`,
          seq: index + 1,
          toolCallId: `read-call-reindex-${index}`,
          title: `Read src/reindex-${index}.ts`,
          status: 'done' as const,
          locations: [{ path: `src/reindex-${index}.ts` }],
        }
  );
  const turns: TranscriptTurn[] = [
    {
      id: 'turn-reindex',
      seq: 0,
      initiator: 'user',
      outcome: { kind: 'done' },
      items: [
        { kind: 'message', id: 'user-reindex', seq: 0, role: 'user', text: 'Run every check.' },
        ...activity,
        {
          kind: 'message',
          id: 'answer-reindex',
          seq: 29,
          role: 'assistant',
          text: 'REINDEX_FINAL_START\n\nThe first detailed finding remains visible after the execution group changes shape.\n\nThe second detailed finding makes this row tall enough to expose a stale virtual height.\n\nREINDEX_FINAL_END',
        },
      ],
    },
    {
      id: 'turn-following',
      seq: 1,
      initiator: 'user',
      outcome: { kind: 'done' },
      items: [
        {
          kind: 'message',
          id: 'user-following',
          seq: 0,
          role: 'user',
          text: 'What comes next?',
        },
        {
          kind: 'thinking',
          id: 'thinking-following',
          seq: 1,
          segmentId: 'segment-following',
          status: 'done',
          text: 'Prepared the follow-up.',
          startedAt: 10,
          durationMs: 500,
        },
        {
          kind: 'message',
          id: 'answer-following',
          seq: 2,
          role: 'assistant',
          text: 'FOLLOWING_FINAL_SENTINEL',
        },
      ],
    },
  ];
  state.transcript.history.seed(turns);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:320px;';
  document.body.appendChild(host);
  const view = createChatView({ context, state, parent: host, groupTurnActivity: true });

  cleanups.push(() => {
    view.dispose();
    state.dispose();
    context.dispose();
    host.remove();
  });

  await waitForStableGeometry(host);
  const header = host.querySelector<HTMLElement>('[data-collapse-id="turn-reindex:execution"]');
  if (!header) throw new Error('Reindex execution group header did not render');
  return { header, host, view };
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

  it('anchors and preserves an explicitly opened live disclosure as the turn settles', async () => {
    const { header, host, state, turn } = await mountLiveGroupedTurn();

    expect(header.getAttribute('aria-expanded')).toBe('false');
    header.click();
    await nextPaint();
    expect(header.getAttribute('aria-expanded')).toBe('true');
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
    expect(settledHeader?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Inspection complete.');
    expect(state.scroll.get()).toMatchObject({
      kind: 'anchor',
      itemId: 'turn-live:execution',
      edge: 'top',
    });
  });

  it('keeps later rows tiled when a preceding execution group is collapsed', async () => {
    const { header, host, view } = await mountReindexedConversation();

    header.click();
    await waitForStableGeometry(host);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    // Before scrolling, numeric row slots are reused in-place for different
    // unit ids. Their element-scoped transform cache must already be correct.
    expectRowsToTile(host);
    view.scrollToBottom();
    await waitForStableGeometry(host);
    expect(host.textContent).toContain('REINDEX_FINAL_START');
    expect(host.textContent).toContain('FOLLOWING_FINAL_SENTINEL');
    const expandedIndices = visibleRows(host).map((row) => Number(row.dataset.index));
    expect(Math.min(...expandedIndices)).toBeGreaterThan(2);
    expect(Math.max(...expandedIndices)).toBeGreaterThan(20);
    expectRowsToTile(host);

    // Collapse through the public view API while the original header is outside
    // the virtual window. This keeps the shifted answer rows mounted and covers
    // the same cross-overscan ownership handoff as a long real conversation.
    view.toggleCollapsed('turn-reindex:execution');
    await waitForStableGeometry(host);

    const collapsedHeader = host.querySelector<HTMLElement>(
      '[data-collapse-id="turn-reindex:execution"]'
    );
    expect(collapsedHeader?.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).toContain('REINDEX_FINAL_START');
    expect(host.textContent).toContain('FOLLOWING_FINAL_SENTINEL');
    expectRowsToTile(host);

    const finalRow = visibleRows(host).find((row) =>
      row.textContent?.includes('REINDEX_FINAL_START')
    );
    const followingUser = host
      .querySelector<HTMLElement>('[data-user-card="user-following"]')
      ?.closest<HTMLElement>('[data-index]');
    expect(finalRow?.dataset.index).toBe('2');
    expect(followingUser?.dataset.index).toBe('3');

    host.style.width = '420px';
    await waitForStableGeometry(host);
    expectRowsToTile(host);
  });
});
