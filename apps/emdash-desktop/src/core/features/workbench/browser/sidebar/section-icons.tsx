import { Bug, Flame, Folder, Heart, Rocket, Star, Target, Zap } from 'lucide-react';
import type { ComponentType } from 'react';
import type { SectionIconName } from '@core/features/workbench/contributions/section-appearance';

/**
 * Icon per stored name. Typed structurally rather than with lucide's own
 * `LucideIcon` so this map does not depend on that type being re-exported.
 */
export const SECTION_ICONS: Record<SectionIconName, ComponentType<{ className?: string }>> = {
  folder: Folder,
  star: Star,
  rocket: Rocket,
  bug: Bug,
  flame: Flame,
  zap: Zap,
  target: Target,
  heart: Heart,
};
