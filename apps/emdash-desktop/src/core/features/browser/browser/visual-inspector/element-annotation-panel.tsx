import { Button, Select, Textarea } from '@emdash/ui/react/primitives';
import { Crosshair, Loader2, Plus, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import {
  redactionSummary,
  visualSelectionLabel,
  visualSelectionSource,
} from '@core/features/browser/api/browser/visual-inspector-display';
import { hasSendableInstruction } from '@core/features/browser/api/browser/visual-inspector-payload';
import type {
  VisualAnnotation,
  VisualInspectorState,
} from '@core/features/browser/api/browser/visual-inspector-store';
import type { AgentTarget } from '@core/features/conversations/api/browser/agent-context-bridge';

export type ElementAnnotationPanelProps = {
  state: VisualInspectorState;
  targets: AgentTarget[];
  targetId: string | null;
  sending: boolean;
  sendError: string | null;
  onSelectTarget: (conversationId: string) => void;
  onInstructionChange: (annotationId: string, value: string) => void;
  onRemove: (annotationId: string) => void;
  onSelectMore: () => void;
  onClear: () => void;
  onSend: () => void;
};

/**
 * Native Emdash panel for the elements picked in the browser. Docked inside the
 * browser pane rather than floating over the page, so it stays usable at any
 * zoom or scroll position and does not anchor to page coordinates.
 */
export const ElementAnnotationPanel = observer(function ElementAnnotationPanel({
  state,
  targets,
  targetId,
  sending,
  sendError,
  onSelectTarget,
  onInstructionChange,
  onRemove,
  onSelectMore,
  onClear,
  onSend,
}: ElementAnnotationPanelProps) {
  const { annotations, status, error } = state;
  const picking = status === 'picking';
  if (annotations.length === 0 && !picking && !error) return null;

  const selectedTarget = targets.find((target) => target.conversationId === targetId) ?? null;
  const canSend = !sending && targetId !== null && hasSendableInstruction(annotations) && !picking;

  return (
    <div className="pointer-events-auto flex max-h-[85%] w-[23rem] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Crosshair className={cnPulse(picking)} />
          <span className="truncate text-xs font-medium text-foreground">
            {picking
              ? 'Click an element in the page'
              : annotations.length === 1
                ? 'Selected element'
                : `${annotations.length} selected elements`}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          icon
          className="size-6 shrink-0"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-3 py-3">
        {annotations.map((annotation, index) => (
          <AnnotationCard
            key={annotation.id}
            annotation={annotation}
            index={index}
            total={annotations.length}
            onInstructionChange={onInstructionChange}
            onRemove={onRemove}
            onSend={onSend}
          />
        ))}
        {picking && (
          <div className="rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-foreground-muted">
            Click another element to add it. Press Esc in the page to cancel.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
        {(sendError ?? error) && (
          <div className="text-destructive flex items-start gap-1.5 text-[11px]">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span className="min-w-0">{sendError ?? error}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
          <span className="shrink-0">Send to</span>
          {targets.length > 0 ? (
            <Select.Root
              value={targetId ?? undefined}
              onValueChange={(value) => onSelectTarget(String(value))}
              disabled={sending}
            >
              <Select.Trigger className="h-6 min-w-0 flex-1 text-xs [&>span]:line-clamp-none">
                <Select.Value>{selectedTarget?.label ?? 'No agent'}</Select.Value>
              </Select.Trigger>
              <Select.Content align="start">
                {targets.map((target) => (
                  <Select.Item key={target.conversationId} value={target.conversationId}>
                    {target.label}
                    {target.isRunning ? ' · running' : ''}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          ) : (
            <span className="min-w-0">
              Open an agent conversation in this task to send the selection.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={picking} onClick={onSelectMore}>
            <Plus className="size-3.5" />
            Element
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClear}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!canSend} onClick={onSend}>
              {sending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send to agent
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

const AnnotationCard = observer(function AnnotationCard({
  annotation,
  index,
  total,
  onInstructionChange,
  onRemove,
  onSend,
}: {
  annotation: VisualAnnotation;
  index: number;
  total: number;
  onInstructionChange: (annotationId: string, value: string) => void;
  onRemove: (annotationId: string) => void;
  onSend: () => void;
}) {
  const selection = annotation.selection;
  const source = visualSelectionSource(selection);
  const redactions = redactionSummary(selection);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background-quaternary-1/40 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-foreground">
            {visualSelectionLabel(selection)}
            {total > 1 && <span className="text-foreground-muted"> · {index + 1}</span>}
          </div>
          {source ? (
            <div className="truncate font-mono text-[11px] text-foreground-muted" title={source}>
              {source}
            </div>
          ) : (
            <div className="truncate font-mono text-[11px] text-foreground-muted">
              {selection.selector}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          icon
          className="size-5 shrink-0"
          aria-label={`Remove ${visualSelectionLabel(selection)}`}
          onClick={() => onRemove(annotation.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="line-clamp-2 rounded bg-background px-1.5 py-1 font-mono text-[10px] leading-4 text-foreground-muted">
        {selection.html}
      </div>
      <Textarea
        value={annotation.instruction}
        rows={2}
        className="text-xs"
        aria-label={`Instruction for ${visualSelectionLabel(selection)}`}
        placeholder="Make this button wider and align it with the table."
        onChange={(event) => onInstructionChange(annotation.id, event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            onSend();
          }
        }}
      />
      {redactions && (
        <div className="text-[10px] text-foreground-tertiary-muted">
          Sensitive values redacted before sending ({redactions})
        </div>
      )}
    </div>
  );
});

function cnPulse(picking: boolean): string {
  return picking
    ? 'size-3.5 shrink-0 animate-pulse text-foreground'
    : 'size-3.5 shrink-0 text-foreground-muted';
}
