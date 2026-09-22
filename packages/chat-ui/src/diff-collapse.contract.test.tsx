import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { createChatContext } from '@/chat-context';
import { createChatView } from '@/chat-view';
import type { ChatDiff, TranscriptTurn } from '@/model';
import { createChatState } from '@/state/chat-state';

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function mountDiff(oldText: string | null = 'const value = 1;') {
  const context = createChatContext();
  const state = createChatState(context);
  const item: ChatDiff = {
    kind: 'diff',
    id: 'edit-1:src/example.ts',
    path: 'src/example.ts',
    oldText,
    newText: 'const value = 2;',
    status: 'done',
  };
  const turn: TranscriptTurn = {
    id: 'turn-1',
    seq: 0,
    initiator: 'agent',
    items: [item] as unknown as TranscriptTurn['items'],
  };
  state.transcript.history.seed([turn]);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:300px;';
  document.body.appendChild(host);
  const onOpenFile = vi.fn();
  const view = createChatView({ context, state, parent: host, commands: { onOpenFile } });

  cleanups.push(() => {
    view.dispose();
    state.dispose();
    context.dispose();
    host.remove();
  });

  await nextPaint();
  const trigger = host.querySelector<HTMLElement>('[data-collapse-id="edit-1:src/example.ts"]');
  if (!trigger) throw new Error('Diff collapse trigger did not render');
  return { host, onOpenFile, trigger };
}

describe('diff collapse contract', () => {
  it('starts as a compact activity row and reveals the preview on demand', async () => {
    const { host, trigger } = await mountDiff();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).toContain('Editedexample.ts');
    expect(host.textContent).not.toContain('const value = 1;');

    await userEvent.click(trigger);
    await nextPaint();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('const value = 1;');
    expect(host.textContent).toContain('const value = 2;');
  });

  it('opens the filename without toggling the disclosure', async () => {
    const { host, onOpenFile, trigger } = await mountDiff();
    const fileButton = host.querySelector<HTMLButtonElement>('button[title="src/example.ts"]');
    if (!fileButton) throw new Error('Diff file button did not render');

    await userEvent.click(fileButton);

    expect(onOpenFile).toHaveBeenCalledWith({
      path: 'src/example.ts',
      itemId: 'edit-1:src/example.ts',
      source: 'diff',
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('labels a newly created file accurately', async () => {
    const { host } = await mountDiff(null);

    expect(host.textContent).toContain('Createdexample.ts');
    expect(host.textContent).not.toContain('Editedexample.ts');
  });

  it('keeps the file and disclosure controls as non-nested sibling buttons', async () => {
    const { host, trigger } = await mountDiff();
    const fileButton = host.querySelector<HTMLButtonElement>('button[title="src/example.ts"]');

    expect(trigger.tagName).toBe('BUTTON');
    expect(fileButton?.parentElement).toBe(trigger.parentElement);
    expect(trigger.contains(fileButton)).toBe(false);
  });
});
