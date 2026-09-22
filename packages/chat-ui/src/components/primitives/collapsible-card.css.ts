import { style } from '@vanilla-extract/css';
import { vars } from '@styles/theme.css';
import { createVariableThemeContract } from '@styles/variable-theme-contract.css';

// ── Runtime geometry contract ─────────────────────────────────────────────────

export type CollapsibleCardStyleVars = {
  height: number;
};

export const collapsibleCardVars = createVariableThemeContract<CollapsibleCardStyleVars>({
  height: null,
});

// ── Card shell ────────────────────────────────────────────────────────────────

export const collapsibleCard = style({
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radiusLg,
  overflow: 'hidden',
  boxSizing: 'border-box',
  height: collapsibleCardVars.height,
});

/** A quiet one-line activity row until its detail body is opened. */
export const collapsibleCardActivity = style({
  borderColor: 'transparent',
  selectors: {
    '&[data-body-visible]': { borderColor: vars.border },
  },
});
