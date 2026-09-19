import { useCommands } from '@components/contexts/CommandsContext';
import { useTurnState } from '@components/contexts/TurnStateContext';
import { BlockStackView } from '@components/primitives/BlockStackView';
import { clipTrackedHeight, isCardAnimating } from '@components/primitives/card-clip';
import { IconStop, ImageOffIcon } from '@components/primitives/icons';
import type { RenderCtx } from '@core/define';
import { blockPlainText } from '@core/markdown/plain-text';
import { pxTokens } from '@styles/px-tokens';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { For, Show, createMemo, createResource } from 'solid-js';
import type { ChatImageAttachment, ChatMessage } from '@/model';
import { type MessageVars, userInnerWidth } from './metrics';
import { layoutUserMessage } from './user-message-layout';
import { srOnly } from './message.css';
import {
  attachmentStrip,
  attachPlaceholder,
  attachThumb,
  attachThumbBtn,
  card,
  cardFadeOverlay,
  cardFrame,
  cardRoot,
  cardVars,
  stopButtonOverlay,
  userCardGroup,
} from './user-message.css';

export function UserMessageCard(props: { data: ChatMessage; ctx: RenderCtx; vars: MessageVars }) {
  const commands = useCommands();
  const turn = useTurnState();
  const mCtx = () => props.ctx.measureCtx?.();

  const isCurrent = () => turn.currentMessageId() === props.data.id;
  const showStop = () => isCurrent() && turn.turnStatus() === 'generating';

  const styleVars = () => ({
    userCardPadX: props.vars.userCardPadX,
    userCardPadY: props.vars.userCardPadY,
    cardBorder: props.vars.cardBorder,
    attachThumb: props.vars.attachThumb,
    attachGap: props.vars.attachGap,
  });

  const layout = createMemo(() => {
    const ctx = mCtx();
    if (!ctx) return null;
    return layoutUserMessage(props.data, ctx, props.vars);
  });

  const fullContentH = () => layout()?.fullHeight ?? props.vars.collapsedMaxH;

  const isExpanded = () => mCtx()?.expandedId === props.data.id;
  const maxH = () => (isExpanded() ? props.vars.expandedMaxH : props.vars.collapsedMaxH);
  const clampedH = () => Math.min(fullContentH(), maxH());
  const isOverflowing = () => fullContentH() > maxH();

  // Track the animated clip edge during expand/collapse tween so the bottom
  // border and rounded corners are never hidden by the UnitRow overflow clip.
  const cardH = clipTrackedHeight(props.ctx, clampedH);

  const plainText = () => {
    const ctx = mCtx();
    if (!ctx) return props.data.text;
    return ctx.caches.parseBlocks(props.data.id, props.data.text).map(blockPlainText).join('\n\n');
  };

  return (
    <div
      class={cardFrame}
      style={assignInlineVars(cardVars, pxTokens({ ...styleVars(), height: cardH() }))}
    >
      <div
        data-user-card={props.data.id}
        class={`${card({ state: isOverflowing() && !isExpanded() ? 'overflowing' : 'static', current: showStop() })} ${cardRoot} ${userCardGroup}`}
        style={{
          width: `${layout()?.bubbleWidth ?? props.vars.userCardMinW}px`,
          // Force overflow:hidden while the UnitRow tween is in flight to avoid
          // a transient scrollbar mid-animation; restore auto only when expanded
          // at rest (so the user can scroll long messages).
          'overflow-y': isCardAnimating(props.ctx) || !isExpanded() ? 'hidden' : 'auto',
          cursor: !isExpanded() && isOverflowing() ? 'pointer' : 'default',
        }}
      >
        <div class={srOnly}>{plainText()}</div>
        <Show when={props.data.attachments?.length}>
          <div class={attachmentStrip}>
            <For each={props.data.attachments}>
              {(att) => <AttachmentThumb attachment={att} itemId={props.data.id} />}
            </For>
          </div>
        </Show>
        <Show when={layout()?.stack}>{(s) => <BlockStackView node={s()} />}</Show>
        <Show when={!isExpanded() && isOverflowing()}>
          <div class={cardFadeOverlay} />
        </Show>
        <Show when={showStop()}>
          <button
            type="button"
            class={stopButtonOverlay}
            aria-label="Stop generating"
            onClick={(e) => {
              e.stopPropagation();
              commands().onStop?.({ itemId: props.data.id });
            }}
          >
            <IconStop />
          </button>
        </Show>
      </div>
    </div>
  );
}

function AttachmentThumb(props: { attachment: ChatImageAttachment; itemId: string }) {
  const commands = useCommands();
  const [resolvedDataUrl] = createResource(
    () => (props.attachment.dataUrl ? null : props.attachment.id),
    async () => commands().resolveAttachment?.(props.attachment) ?? null
  );
  const dataUrl = () => props.attachment.dataUrl ?? resolvedDataUrl() ?? undefined;

  return (
    <Show
      when={dataUrl()}
      fallback={
        <div title={props.attachment.name} class={attachPlaceholder}>
          <ImageOffIcon />
        </div>
      }
    >
      {(src) => (
        <button
          type="button"
          class={attachThumbBtn}
          aria-label={`View image: ${props.attachment.name}`}
          onClick={(e) => {
            e.stopPropagation();
            commands().onViewImage?.({
              attachment: { ...props.attachment, dataUrl: src() },
              itemId: props.itemId,
              source: 'user-message',
            });
          }}
        >
          <img src={src()} alt={props.attachment.name} class={attachThumb} />
        </button>
      )}
    </Show>
  );
}

export { userInnerWidth };
export type { MessageVars };
