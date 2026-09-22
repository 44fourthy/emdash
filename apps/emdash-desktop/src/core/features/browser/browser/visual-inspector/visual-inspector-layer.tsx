import { useToast } from '@emdash/ui/react/primitives';
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import { buildVisualContextPrompt } from '@core/features/browser/api/browser/visual-inspector-payload';
import type { VisualInspectorPicker } from '@core/features/browser/api/browser/visual-inspector-picker';
import { visualInspectorStore } from '@core/features/browser/api/browser/visual-inspector-store';
import {
  activeConversationIdsFromPaneLayout,
  listAgentTargets,
  resolveActiveAgentTarget,
  sendVisualContextToAgent,
} from '@core/features/conversations/api/browser/agent-context-bridge';
import { useTaskViewContext } from '@core/features/tasks/contributions/browser/task-view-context';
import { useTaskComposition } from '@core/features/workbench/api/browser/task-composition-context';
import { ElementAnnotationPanel } from './element-annotation-panel';

/**
 * Bridges the picked elements of one browser tab to the task's active agent.
 *
 * The panel is docked inside the browser pane; the wrapper is pointer-events
 * none so the page underneath stays interactive everywhere outside the panel.
 */
export const VisualInspectorLayer = observer(function VisualInspectorLayer({
  browserId,
  picker,
}: {
  browserId: string;
  picker: VisualInspectorPicker;
}) {
  const { taskId } = useTaskViewContext();
  const { paneLayout } = useTaskComposition();
  const { toast } = useToast();
  const state = visualInspectorStore.stateFor(browserId);

  const targets = listAgentTargets(taskId);
  const preferredTarget = resolveActiveAgentTarget({
    taskId,
    activeConversationIds: activeConversationIdsFromPaneLayout(paneLayout),
  });
  const [targetOverride, setTargetOverride] = useState<string | null>(null);
  const targetId =
    targetOverride && targets.some((target) => target.conversationId === targetOverride)
      ? targetOverride
      : (preferredTarget?.conversationId ?? null);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleInstructionChange = useCallback(
    (annotationId: string, value: string) => {
      visualInspectorStore.setInstruction(browserId, annotationId, value);
    },
    [browserId]
  );

  const handleRemove = useCallback(
    (annotationId: string) => {
      visualInspectorStore.removeAnnotation(browserId, annotationId);
    },
    [browserId]
  );

  const handleSend = useCallback(async () => {
    if (!targetId || sending) return;
    const prompt = buildVisualContextPrompt(visualInspectorStore.stateFor(browserId).annotations);
    if (!prompt.trim()) return;
    setSending(true);
    setSendError(null);
    const result = await sendVisualContextToAgent({
      taskId,
      conversationId: targetId,
      text: prompt,
    });
    setSending(false);
    if (!result.success) {
      setSendError(result.error);
      return;
    }
    const label =
      targets.find((target) => target.conversationId === targetId)?.label ?? 'the agent';
    toast.success(`Sent to ${label}`);
    setTargetOverride(null);
    await picker.clearAnnotations();
  }, [browserId, picker, sending, targetId, targets, taskId, toast]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-3">
      <ElementAnnotationPanel
        state={state}
        targets={targets}
        targetId={targetId}
        sending={sending}
        sendError={sendError}
        onSelectTarget={(conversationId) => setTargetOverride(conversationId)}
        onInstructionChange={handleInstructionChange}
        onRemove={handleRemove}
        onSelectMore={() => void picker.startPick()}
        onClear={() => {
          setSendError(null);
          void picker.clearAnnotations();
        }}
        onSend={() => void handleSend()}
      />
    </div>
  );
});
