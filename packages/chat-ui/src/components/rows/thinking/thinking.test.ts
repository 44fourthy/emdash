// @vitest-environment jsdom

import { createChatCaches } from '@core/caches';
import type { MeasureCtx } from '@core/define';
import { DEFAULT_THEME } from '@core/theme';
import { describe, expect, it, vi } from 'vitest';
import type { ChatThinking } from '@/model';
import { THINKING_VARS, thinkingBodyText, thinkingMeasure } from './thinking.def';

function thinking(text: string, status: ChatThinking['status'] = 'thinking'): ChatThinking {
  return {
    kind: 'thinking',
    id: 'thinking-1',
    seq: 0,
    segmentId: 'segment-1',
    status,
    text,
    startedAt: 0,
  };
}

function measureCtx(expanded: boolean): MeasureCtx {
  return {
    theme: DEFAULT_THEME,
    width: 640,
    isCollapsed: () => expanded,
    expanded: () => expanded,
    caches: createChatCaches(),
  };
}

describe('active thinking preview', () => {
  it('bounds collapsed active text at a paragraph boundary', () => {
    const tail = 'latest reasoning '.repeat(300);
    const item = thinking(`${'old reasoning '.repeat(1_000)}\n\n${tail}`);

    const preview = thinkingBodyText(item, false);

    expect(preview).toBe(tail);
    expect(preview.length).toBeLessThanOrEqual(8 * 1024);
  });

  it('keeps complete text when expanded or settled', () => {
    const text = 'reasoning '.repeat(2_000);
    expect(thinkingBodyText(thinking(text), true)).toBe(text);
    expect(thinkingBodyText(thinking(text, 'done'), false)).toBe(text);
  });

  it('measures the bounded preview instead of the full active transcript', () => {
    const item = thinking('reasoning '.repeat(2_000));
    const ctx = measureCtx(false);
    const parse = vi.spyOn(ctx.caches, 'parseBlocks').mockReturnValue([]);

    thinkingMeasure(item, ctx, THINKING_VARS);

    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0][1].length).toBeLessThanOrEqual(8 * 1024);
  });
});
