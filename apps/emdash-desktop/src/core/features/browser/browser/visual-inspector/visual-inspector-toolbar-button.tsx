import { Button, Tooltip } from '@emdash/ui/react/primitives';
import { Crosshair } from 'lucide-react';
import { cn } from '@core/primitives/styling/browser/cn';

/** Toolbar toggle that arms element selection in the loaded page. */
export function VisualInspectorToolbarButton({
  active,
  disabled,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const label = active ? 'Stop selecting elements' : 'Select element to send to the agent';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            icon
            className={cn(
              'size-7 shrink-0',
              active &&
                'bg-background-quaternary-1 text-foreground hover:bg-background-quaternary-1'
            )}
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            onClick={onToggle}
          >
            <Crosshair className="size-4" />
          </Button>
        }
      />
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip.Root>
  );
}
