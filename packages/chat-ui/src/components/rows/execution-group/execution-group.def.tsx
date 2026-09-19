import { ROW_H } from '@components/engine/row-metrics';
import { CollapseHeader } from '@components/primitives/CollapseHeader';
import { defineUnit } from '@core/units';
import type { ExecutionGroupItem } from '@/model';
import {
  executionGroupCount,
  executionGroupLabel,
  executionGroupRoot,
} from './execution-group.css';

function statusLabel(status: ExecutionGroupItem['status']): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'stopped':
      return 'Stopped';
    case 'failed':
      return 'Failed';
    case 'done':
    default:
      return 'Done';
  }
}

function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'step' : 'steps'}`;
}

export const executionGroupUnitDef = defineUnit<ExecutionGroupItem, { rowH: number }>({
  kind: 'execution-group',
  margin: { top: 8, bottom: 4 },
  vars: { rowH: ROW_H },

  measure(_item, _ctx, vars) {
    return vars.rowH;
  },

  Render(props) {
    return (
      <div class={executionGroupRoot} style={{ height: `${props.vars.rowH}px` }}>
        <CollapseHeader
          id={props.data.toggleId}
          expanded={props.data.expanded}
          active={props.data.active}
          awaitingPermission={props.data.awaitingPermission}
          error={props.data.status === 'failed'}
          errorTitle={props.data.error}
          height={props.vars.rowH}
        >
          <span class={executionGroupLabel}>
            <span>{statusLabel(props.data.status)}</span>
            <span class={executionGroupCount}>{itemCountLabel(props.data.itemCount)}</span>
          </span>
        </CollapseHeader>
      </div>
    );
  },
});
