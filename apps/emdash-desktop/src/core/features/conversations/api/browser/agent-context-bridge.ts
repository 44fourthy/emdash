import type { AgentProviderId } from '@emdash/plugins/agents/types';
import { formatConversationTitleForDisplay } from '@core/features/conversations/api/browser/conversation-title-utils';
import { conversationRegistry } from '@core/features/conversations/api/browser/stores/conversation-registry';
import { pastePromptInjection } from '@core/features/terminals/api/browser/pty/prompt-injection';
import type { ConversationType } from '@core/primitives/conversations/api';
import { getConversationsClient } from './client';

/**
 * Agent-agnostic bridge for sending app-generated context into whichever agent
 * conversation a task is running. ACP conversations go through the existing
 * sendPrompt wire path (the runtime wakes a suspended session on demand); PTY
 * conversations reuse the same bracketed-paste injection the context bar uses.
 */

export type AgentTarget = {
  conversationId: string;
  type: ConversationType;
  providerId: AgentProviderId;
  label: string;
  /** Host-reported live session, not merely an open tab. */
  isRunning: boolean;
};

export type SendAgentPromptResult = { success: true } | { success: false; error: string };

export function listAgentTargets(taskId: string): AgentTarget[] {
  const manager = conversationRegistry.get(taskId);
  if (!manager) return [];
  return Array.from(manager.conversations.values()).map((conversation) => ({
    conversationId: conversation.data.id,
    type: conversation.data.type ?? 'pty',
    providerId: conversation.data.providerId,
    label: formatConversationTitleForDisplay(conversation.data.providerId, conversation.data.title),
    isRunning: manager.isSessionActive(conversation.data.id),
  }));
}

/**
 * Picks the conversation to send to: the caller's active tab order first (the
 * conversation currently open next to the browser), then a running session, then
 * the most recently used conversation.
 */
export function resolveActiveAgentTarget(input: {
  taskId: string;
  /** Conversation ids from the active pane, most relevant first. */
  activeConversationIds?: readonly string[];
}): AgentTarget | null {
  const targets = listAgentTargets(input.taskId);
  if (targets.length === 0) return null;

  for (const conversationId of input.activeConversationIds ?? []) {
    const match = targets.find((target) => target.conversationId === conversationId);
    if (match) return match;
  }

  const byRecency = (a: AgentTarget, b: AgentTarget) =>
    recency(input.taskId, b.conversationId) - recency(input.taskId, a.conversationId);

  const running = targets.filter((target) => target.isRunning).sort(byRecency);
  if (running.length > 0) return running[0];
  return [...targets].sort(byRecency)[0] ?? null;
}

export async function sendVisualContextToAgent(input: {
  taskId: string;
  conversationId: string;
  text: string;
}): Promise<SendAgentPromptResult> {
  if (!input.text.trim()) return { success: false, error: 'Nothing to send.' };
  const conversation = conversationRegistry
    .get(input.taskId)
    ?.conversations.get(input.conversationId)?.data;
  if (!conversation) {
    return { success: false, error: 'That agent conversation is no longer available.' };
  }

  if ((conversation.type ?? 'pty') === 'acp')
    return sendAcpPrompt(input.conversationId, input.text);
  return sendPtyPrompt(input.taskId, input.conversationId, conversation.providerId, input.text);
}

async function sendAcpPrompt(conversationId: string, text: string): Promise<SendAgentPromptResult> {
  try {
    const client = await getConversationsClient();
    const result = await client.acp.sendPrompt(
      {
        conversationId,
        promptId: crypto.randomUUID(),
        prompt: { text },
      },
      { timeoutMs: 0 }
    );
    return result.success
      ? { success: true }
      : { success: false, error: describeError(result.error) };
  } catch (error) {
    return { success: false, error: describeError(error) };
  }
}

async function sendPtyPrompt(
  taskId: string,
  conversationId: string,
  providerId: AgentProviderId,
  text: string
): Promise<SendAgentPromptResult> {
  const session = conversationRegistry.get(taskId)?.sessions.get(conversationId);
  if (!session) {
    return { success: false, error: 'That terminal conversation has no running session.' };
  }
  try {
    await session.connect();
    await pastePromptInjection({
      providerId,
      text,
      forceBracketedPaste: true,
      sendInput: async (data) => {
        session.pty?.sendInput(data);
      },
    });
    await session.connect();
    session.pty?.sendInput('\r');
    session.pty?.terminal.focus();
    return { success: true };
  } catch (error) {
    return { success: false, error: describeError(error) };
  }
}

/** Minimal pane shape needed to read the conversation tabs open in a task view. */
type PaneTabLike = { kind: string; isActive: boolean; resource: unknown };
type PaneLike = { resolvedTabs: readonly PaneTabLike[] };
type PaneLayoutLike = {
  activePaneId: string;
  groups: readonly { paneId: string; pane: PaneLike }[];
};

/**
 * Conversation ids of the active tabs in a task's panes, focused pane first —
 * the "active agent session" a user sees when they are looking at the browser.
 */
export function activeConversationIdsFromPaneLayout(layout: PaneLayoutLike | undefined): string[] {
  if (!layout) return [];
  const ordered = [
    ...layout.groups.filter((group) => group.paneId === layout.activePaneId),
    ...layout.groups.filter((group) => group.paneId !== layout.activePaneId),
  ];
  return ordered.flatMap((group) => conversationIdsForPane(group.pane));
}

function conversationIdsForPane(pane: PaneLike): string[] {
  return pane.resolvedTabs
    .filter((tab) => tab.isActive && (tab.kind === 'conversation' || tab.kind === 'acp-chat'))
    .map((tab) => conversationIdOf(tab.resource))
    .filter((id): id is string => typeof id === 'string');
}

function conversationIdOf(resource: unknown): string | undefined {
  const store = (resource as { store?: unknown } | null | undefined)?.store;
  if (!store || typeof store !== 'object') return undefined;
  const data = (store as { data?: { id?: unknown } }).data;
  if (data && typeof data.id === 'string') return data.id;
  const conversationId = (store as { conversationId?: unknown }).conversationId;
  return typeof conversationId === 'string' ? conversationId : undefined;
}

function recency(taskId: string, conversationId: string): number {
  const lastInteractedAt = conversationRegistry.get(taskId)?.conversations.get(conversationId)
    ?.data.lastInteractedAt;
  if (!lastInteractedAt) return 0;
  const parsed = Date.parse(lastInteractedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'The agent could not receive the selection.';
}
