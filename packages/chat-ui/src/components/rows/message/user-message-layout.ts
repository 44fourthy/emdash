import type { StackLayout } from '@core/compose';
import type { MeasureCtx, Measured } from '@core/define';
import { layoutBlockStack } from '@core/layout/block-stack';
import type { ChatMessage } from '@/model';
import { attachStripHeight, type MessageVars, userInnerWidth } from './metrics';

export type UserMessageLayout = {
  bubbleWidth: number;
  fullHeight: number;
  stack: Measured<StackLayout> | null;
};

/**
 * Measure a user message as a right-aligned, content-hugging bubble.
 *
 * The first pass uses the full transcript width to discover the block stack's
 * natural rendered width. The second pass lays the blocks out at the resulting
 * bubble width so the DOM and virtualizer keep the same geometry.
 */
export function layoutUserMessage(
  item: ChatMessage,
  ctx: MeasureCtx,
  vars: MessageVars
): UserMessageLayout {
  const chromeX = 2 * vars.userCardPadX + 2 * vars.cardBorder;
  const maxInnerWidth = userInnerWidth(ctx.width, vars);
  const blocks = ctx.caches.parseBlocks(item.id, item.text);
  const fullWidthStack =
    blocks.length > 0
      ? layoutBlockStack(blocks, { ...ctx, width: maxInnerWidth }, { isCollapsed: ctx.isCollapsed })
      : null;

  const attachmentCount = item.attachments?.length ?? 0;
  const attachmentWidth =
    attachmentCount > 0
      ? Math.min(
          maxInnerWidth,
          attachmentCount * vars.attachThumb + (attachmentCount - 1) * vars.attachGap
        )
      : 0;
  const minimumInnerWidth = Math.max(1, Math.min(maxInnerWidth, vars.userCardMinW - chromeX));
  const desiredInnerWidth = Math.max(
    minimumInnerWidth,
    attachmentWidth,
    Math.min(maxInnerWidth, fullWidthStack?.width ?? 0)
  );
  const bubbleWidth = Math.min(ctx.width, Math.ceil(desiredInnerWidth) + chromeX);
  const innerWidth = userInnerWidth(bubbleWidth, vars);
  const stack =
    blocks.length > 0
      ? innerWidth === maxInnerWidth
        ? fullWidthStack
        : layoutBlockStack(blocks, { ...ctx, width: innerWidth }, { isCollapsed: ctx.isCollapsed })
      : null;
  const attachmentHeight = attachStripHeight(attachmentCount, innerWidth, vars);
  const bodyHeight = stack?.height ?? ctx.theme.fonts.body.lineHeight;

  return {
    bubbleWidth,
    fullHeight: attachmentHeight + bodyHeight + 2 * vars.userCardPadY + 2 * vars.cardBorder,
    stack,
  };
}
