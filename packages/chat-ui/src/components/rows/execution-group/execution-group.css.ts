import { style } from '@vanilla-extract/css';
import { vars } from '@styles/theme.css';

export const executionGroupRoot = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 10px',
  borderRadius: vars.radiusMd,
  background: vars.bg1,
  color: vars.fgMuted,
  selectors: {
    '&:hover': {
      background: vars.bg2,
      color: vars.fg,
    },
    '&:focus-within': {
      boxShadow: 'inset 0 0 0 2px color-mix(in srgb, currentColor 24%, transparent)',
    },
  },
});

export const executionGroupLabel = style({
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '6px',
  fontWeight: 500,
});

export const executionGroupCount = style({
  color: vars.fgPassive,
  fontWeight: 400,
});
