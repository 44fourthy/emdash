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

describe('user message bubble contract', () => {
  it('hugs short content and aligns it to the transcript right edge', async () => {
    const context = createChatContext();
    const state = createChatState(context);
    const turn: TranscriptTurn = {
      id: 'turn-1',
      seq: 0,
      initiator: 'user',
      items: [{ kind: 'message', id: 'user-1', seq: 0, role: 'user', text: 'Yes please!' }],
    };
    state.transcript.history.seed([turn]);

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:300px;';
    document.body.appendChild(host);
    const view = createChatView({ context, state, parent: host });

    cleanups.push(() => {
      view.dispose();
      state.dispose();
      context.dispose();
      host.remove();
    });

    await nextPaint();
    const bubble = host.querySelector<HTMLElement>('[data-user-card="user-1"]');
    const probe = host.querySelector<HTMLElement>('[data-chat-width-probe]');
    expect(bubble).not.toBeNull();
    expect(probe).not.toBeNull();

    const bubbleRect = bubble!.getBoundingClientRect();
    const probeRect = probe!.getBoundingClientRect();
    expect(Math.abs(bubbleRect.right - probeRect.right)).toBeLessThan(1);
    expect(bubbleRect.width).toBeGreaterThanOrEqual(72);
    expect(bubbleRect.width).toBeLessThan(200);
  });
});
