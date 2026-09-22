import { describe, expect, it, vi } from 'vitest';
import type { TaskComposition } from '@core/features/workbench/api/browser/task-composition';
import { openNotificationConversationTab } from './notification-open-handlers';

describe('openNotificationConversationTab', () => {
  it.each([
    ['acp', 'acp-chat'],
    ['pty', 'conversation'],
  ] as const)('opens a %s conversation with the %s tab provider', (type, expectedKind) => {
    const open = vi.fn();

    openNotificationConversationTab(
      { open } as unknown as TaskComposition['paneLayout'],
      'conversation-1',
      type
    );

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      expectedKind,
      { conversationId: 'conversation-1' },
      { preview: false }
    );
  });
});
