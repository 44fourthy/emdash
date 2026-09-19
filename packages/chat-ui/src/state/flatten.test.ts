import { unit } from '@core/units';
import type { ItemSegmenter, SegmentCtx, SegmentItem, UnitDef } from '@core/units';
import { describe, expect, it } from 'vitest';
import type {
  ChatItem,
  ChatMessage,
  ChatThinking,
  ThinkingGroupItem,
  TranscriptTurn,
} from '@/model';
import { applyTurnEvent } from '@/stories/_harness/turn-reducer';
import { collectUserTurnUnits, flattenTier, makeUnitsView } from './flatten';
import { createTranscript } from './transcript';

const MSG_MARGIN_TOP = 8;

function passthrough(kind: SegmentItem['kind']): ItemSegmenter {
  return {
    kind,
    segment: (item: SegmentItem) => [unit(item.kind, item, item, { key: 'self' })],
  };
}

const STUB_SEGMENTERS: Record<string, ItemSegmenter> = {
  message: passthrough('message'),
  tool: passthrough('tool'),
  thinking: passthrough('thinking'),
  'thinking-group': passthrough('thinking-group'),
  'execution-group': passthrough('execution-group'),
  'turn-outcome': passthrough('turn-outcome'),
  working: passthrough('working'),
  'file-op': passthrough('file-op'),
  execute: passthrough('execute'),
  diff: passthrough('diff'),
  'resource-link': passthrough('resource-link'),
  plan: passthrough('plan'),
};

function userMsg(id: string, seq = 0, text = 'hello'): ChatMessage {
  return { kind: 'message', id, seq, role: 'user', text };
}

function assistantMsg(id: string, seq = 0, text = 'done'): ChatMessage {
  return { kind: 'message', id, seq, role: 'assistant', text };
}

function tool(id: string, seq = 0, status: 'running' | 'done' | 'error' = 'done'): ChatItem {
  return { kind: 'tool', id, seq, name: 'bash', status } as ChatItem;
}

function thinking(id: string, seq = 0, status: 'thinking' | 'done' = 'done'): ChatThinking {
  return {
    kind: 'thinking',
    id,
    seq,
    status,
    text: `Reasoning ${id}`,
    startedAt: 0,
    ...(status === 'done' ? { durationMs: 1000 } : {}),
  };
}

function turn(id: string, seq: number, ...items: ChatItem[]): TranscriptTurn {
  return {
    id,
    seq,
    initiator: items.some((item) => item.kind === 'message' && item.role === 'user')
      ? 'user'
      : 'agent',
    items: items as TranscriptTurn['items'],
  };
}

const segCtx = {
  caches: {},
  expanded: () => false,
  active: false,
  plan: () => null,
  pendingToolCallIds: () => new Set<string>(),
  terminalOutput: () => null,
} as unknown as SegmentCtx;

type StubUnitDefs = Record<string, Pick<UnitDef<unknown, Record<string, number>>, 'margin'>>;

const STUB_UNIT_DEFS: StubUnitDefs = {
  message: { margin: { top: 8, bottom: 8 } },
  tool: { margin: { top: 2, bottom: 2 } },
  thinking: { margin: { top: 6, bottom: 6 } },
  'thinking-group': { margin: { top: 6, bottom: 6 } },
  'file-op': { margin: { top: 2, bottom: 2 } },
  execute: { margin: { top: 2, bottom: 2 } },
  diff: { margin: { top: 2, bottom: 6 } },
  'resource-link': { margin: { top: 2, bottom: 2 } },
  plan: { margin: { top: 8, bottom: 8 } },
};

function driveEvent(
  tx: ReturnType<typeof createTranscript>,
  event: Parameters<typeof applyTurnEvent>[1]
) {
  tx.activeTurn.set(applyTurnEvent(tx.activeTurn.get(), event), 'generating');
}

function flattenCommitted(tx: ReturnType<typeof createTranscript>, unitDefs?: StubUnitDefs) {
  return flattenTier(tx.state.committedTurns, segCtx, STUB_SEGMENTERS, unitDefs);
}

function flattenActive(
  tx: ReturnType<typeof createTranscript>,
  prevKind?: string,
  unitDefs?: StubUnitDefs
) {
  const at = tx.state.activeTurnSnapshot;
  return flattenTier(
    at ? [at] : [],
    { ...segCtx, active: true },
    STUB_SEGMENTERS,
    unitDefs,
    prevKind
  );
}

function flattenAll(tx: ReturnType<typeof createTranscript>, unitDefs?: StubUnitDefs) {
  const c = flattenCommitted(tx, unitDefs);
  const prevKind = c.length > 0 ? c[c.length - 1].kind : undefined;
  const a = flattenActive(tx, prevKind, unitDefs);
  return makeUnitsView(c, a);
}

describe('flatten — basic', () => {
  it('returns empty view for an empty transcript', () => {
    const tx = createTranscript();
    expect(flattenAll(tx).length).toBe(0);
  });

  it('produces one unit per committed item', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('a', 0), userMsg('b', 1), tool('c', 2))]);
    const view = flattenAll(tx);
    expect(view.length).toBe(3);
    expect(view.at(0)?.itemId).toBe('a');
    expect(view.at(1)?.itemId).toBe('b');
    expect(view.at(2)?.itemId).toBe('c');
  });

  it('unit ids are ${itemId}#self', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('x'))]);
    expect(flattenAll(tx).at(0)?.id).toBe('x#self');
  });

  it('unit.data is the same committed item reference', () => {
    const tx = createTranscript();
    const item = userMsg('a');
    tx.history.seed([turn('t1', 0, item)]);
    const view = flattenAll(tx);
    expect(view.at(0)?.data).toBe(tx.state.committedTurns[0].items[0]);
  });
});

describe('flatten — adjacent thinking groups', () => {
  it('wraps two or more adjacent thinking items in one presentation group', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('u', 0), thinking('th-1', 1), thinking('th-2', 2))]);

    const view = flattenAll(tx);
    expect(view.length).toBe(2);
    expect(view.at(1)).toMatchObject({
      kind: 'thinking-group',
      itemId: 'th-1:thinking-group',
      id: 'th-1:thinking-group#self',
    });
    const group = view.at(1)?.data as ThinkingGroupItem | undefined;
    expect(group?.steps.map((step) => step.id)).toEqual(['th-1', 'th-2']);
  });

  it('keeps one thinking item as the existing thinking row', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, thinking('th-1'))]);

    expect(flattenAll(tx).at(0)).toMatchObject({
      kind: 'thinking',
      itemId: 'th-1',
      id: 'th-1#self',
    });
  });

  it('does not group thinking across another visible item or a turn boundary', () => {
    const tx = createTranscript();
    tx.history.seed([
      turn('t1', 0, thinking('th-1', 0), tool('tool-1', 1), thinking('th-2', 2)),
      turn('t2', 1, thinking('th-3', 0)),
    ]);

    const view = flattenAll(tx);
    expect(Array.from({ length: view.length }, (_, i) => view.at(i)?.kind)).toEqual([
      'thinking',
      'tool',
      'thinking',
      'thinking',
    ]);
  });

  it('keeps the group id stable while more adjacent steps arrive', () => {
    const first = flattenTier(
      [turn('t1', 0, thinking('th-1', 0), thinking('th-2', 1, 'thinking'))],
      { ...segCtx, active: true },
      STUB_SEGMENTERS
    );
    const grown = flattenTier(
      [turn('t1', 0, thinking('th-1', 0), thinking('th-2', 1), thinking('th-3', 2, 'thinking'))],
      { ...segCtx, active: true },
      STUB_SEGMENTERS
    );

    expect(first[0].id).toBe('th-1:thinking-group#self');
    expect(grown[0].id).toBe(first[0].id);
    expect((grown[0].data as ThinkingGroupItem).steps).toHaveLength(3);
  });
});

describe('flatten — gaps', () => {
  it('first unit has gapBefore = 0', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('a', 0), tool('b', 1))]);
    expect(flattenAll(tx, STUB_UNIT_DEFS).at(0)?.gapBefore).toBe(0);
  });

  it('user to tool seam collapses to message margin', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('a', 0), tool('b', 1))]);
    expect(flattenAll(tx, STUB_UNIT_DEFS).at(1)?.gapBefore).toBe(MSG_MARGIN_TOP);
  });

  it('tool to tool seam collapses adjacent margins', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('u', 0), tool('a', 1), tool('b', 2))]);
    expect(flattenAll(tx, STUB_UNIT_DEFS).at(2)?.gapBefore).toBe(2);
  });
});

describe('flatten — active turn', () => {
  it('includes active turn items at the end', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('a'))]);
    driveEvent(tx, { type: 'message_chunk', id: 'streaming', role: 'assistant', text: 'hi' });
    const view = flattenAll(tx);
    expect(view.length).toBe(2);
    expect(view.at(1)?.itemId).toBe('streaming');
  });

  it('first active unit gets gapBefore from committed last kind', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('u1'))]);
    driveEvent(tx, { type: 'message_chunk', id: 'streaming', role: 'assistant', text: 'hi' });
    const committedUnits = flattenCommitted(tx, STUB_UNIT_DEFS);
    const activeUnits = flattenActive(
      tx,
      committedUnits[committedUnits.length - 1]?.kind,
      STUB_UNIT_DEFS
    );
    expect(activeUnits[0]?.gapBefore).toBe(8);
  });
});

describe('flatten — identity stability', () => {
  it('same committed turns produce stable unit ids and data refs', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, userMsg('a', 0), tool('b', 1))]);
    const r1 = flattenCommitted(tx);
    const r2 = flattenCommitted(tx);
    expect(r1[0].id).toBe(r2[0].id);
    expect(r1[1].id).toBe(r2[1].id);
    expect(r1[0].data).toBe(r2[0].data);
    expect(r1[0].data).toBe(tx.state.committedTurns[0].items[0]);
  });

  it('commit produces a committed turn distinct from the active proxy', () => {
    const tx = createTranscript();
    driveEvent(tx, { type: 'message_chunk', id: 'msg-1', role: 'assistant', text: 'hi' });
    const streaming = tx.state.activeTurnSnapshot?.items[0];
    tx.activeTurn.commit('done');
    const committed = tx.state.committedTurns[0].items[0];
    expect(committed).not.toBe(streaming);
    expect(flattenCommitted(tx)[0].data).toBe(committed);
  });
});

describe('flatten — grouped turn activity', () => {
  const groupedCtx = (opts?: {
    active?: boolean;
    activeTurnId?: string;
    expanded?: readonly string[];
  }): SegmentCtx => {
    const expanded = new Set(opts?.expanded ?? []);
    return {
      ...segCtx,
      active: opts?.active ?? false,
      activeTurnId: opts?.activeTurnId,
      groupTurnActivity: true,
      expanded: (id) => expanded.has(id),
    };
  };

  it('keeps the final assistant reply visible while completed activity is collapsed', () => {
    const units = flattenTier(
      [
        turn(
          'turn-1',
          0,
          userMsg('user-1', 0),
          thinking('thought-1', 1),
          tool('tool-1', 2),
          assistantMsg('answer-1', 3)
        ),
      ],
      groupedCtx(),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(units.map((unit) => unit.kind)).toEqual(['message', 'execution-group', 'message']);
    expect(units[1]).toMatchObject({
      id: 'turn-1:execution#self',
      itemId: 'turn-1:execution',
      data: { status: 'done', itemCount: 2, expanded: false },
    });
    expect(units[2]?.itemId).toBe('answer-1');
  });

  it('reveals every activity row in order behind the one group disclosure', () => {
    const units = flattenTier(
      [
        turn(
          'turn-1',
          0,
          userMsg('user-1', 0),
          assistantMsg('progress-1', 1, 'Checking'),
          tool('tool-1', 2),
          assistantMsg('answer-1', 3)
        ),
      ],
      groupedCtx({ expanded: ['turn-1:execution'] }),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(units.map((unit) => `${unit.kind}:${unit.itemId}`)).toEqual([
      'message:user-1',
      'execution-group:turn-1:execution',
      'message:progress-1',
      'tool:tool-1',
      'message:answer-1',
    ]);
  });

  it('keeps every message in the trailing assistant run outside the activity group', () => {
    const units = flattenTier(
      [
        turn(
          'turn-1',
          0,
          userMsg('user-1', 0),
          tool('tool-1', 1),
          assistantMsg('answer-1', 2, 'First answer block'),
          assistantMsg('answer-2', 3, 'Second answer block')
        ),
      ],
      groupedCtx(),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(units.map((unit) => `${unit.kind}:${unit.itemId}`)).toEqual([
      'message:user-1',
      'execution-group:turn-1:execution',
      'message:answer-1',
      'message:answer-2',
    ]);
    expect(units[1]?.data).toMatchObject({ itemCount: 1, expanded: false });
  });

  it('auto-opens the live run and lets its separate hide override collapse it', () => {
    const live = turn('turn-live', 0, userMsg('user-1', 0), thinking('thought-1', 1, 'thinking'));
    const open = flattenTier(
      [live],
      groupedCtx({ active: true, activeTurnId: 'turn-live' }),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );
    const hidden = flattenTier(
      [live],
      groupedCtx({
        active: true,
        activeTurnId: 'turn-live',
        expanded: ['turn-live:execution:hide'],
      }),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(open.map((unit) => unit.kind)).toEqual(['message', 'execution-group', 'thinking']);
    expect(open[1]?.data).toMatchObject({
      status: 'working',
      expanded: true,
      toggleId: 'turn-live:execution:hide',
    });
    expect(hidden.map((unit) => unit.kind)).toEqual(['message', 'execution-group']);
  });

  it('does not add a fake working group when the active tier only has a pending prompt', () => {
    const pending = turn('pending:prompt-1:turn', 0, userMsg('prompt-1', 0));
    const units = flattenTier(
      [pending],
      groupedCtx({ active: true }),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(units.map((unit) => unit.kind)).toEqual(['message']);
  });

  it('defaults failed and stopped groups open while preserving a hide override', () => {
    const cases = [
      {
        turn: {
          ...turn('turn-failed', 0, userMsg('user-failed', 0), tool('tool-failed', 1)),
          outcome: { kind: 'error' as const, reason: 'prompt_failed' as const },
        },
        groupId: 'turn-failed:execution',
        status: 'failed',
      },
      {
        turn: {
          ...turn('turn-stopped', 0, userMsg('user-stopped', 0), tool('tool-stopped', 1)),
          outcome: { kind: 'cancelled' as const },
        },
        groupId: 'turn-stopped:execution',
        status: 'stopped',
      },
    ] as const;

    for (const entry of cases) {
      const open = flattenTier([entry.turn], groupedCtx(), STUB_SEGMENTERS, STUB_UNIT_DEFS);
      const hidden = flattenTier(
        [entry.turn],
        groupedCtx({ expanded: [`${entry.groupId}:hide`] }),
        STUB_SEGMENTERS,
        STUB_UNIT_DEFS
      );

      expect(open[1]?.data).toMatchObject({
        status: entry.status,
        expanded: true,
        toggleId: `${entry.groupId}:hide`,
      });
      expect(open.map((unit) => unit.kind)).toEqual([
        'message',
        'execution-group',
        'tool',
        'turn-outcome',
      ]);
      expect(hidden.map((unit) => unit.kind)).toEqual(['message', 'execution-group']);
    }
  });

  it('keeps outcome-less retained running activity visible and unresolved', () => {
    const unresolved = turn(
      'turn-unresolved',
      0,
      userMsg('user-unresolved', 0),
      tool('tool-running', 1, 'running')
    );
    const open = flattenTier([unresolved], groupedCtx(), STUB_SEGMENTERS, STUB_UNIT_DEFS);
    const hidden = flattenTier(
      [unresolved],
      groupedCtx({ expanded: ['turn-unresolved:execution:hide'] }),
      STUB_SEGMENTERS,
      STUB_UNIT_DEFS
    );

    expect(open[1]?.data).toMatchObject({
      status: 'working',
      active: false,
      expanded: true,
      toggleId: 'turn-unresolved:execution:hide',
    });
    expect(open.map((unit) => unit.kind)).toEqual(['message', 'execution-group', 'tool']);
    expect(hidden.map((unit) => unit.kind)).toEqual(['message', 'execution-group']);
  });

  it('keeps the group id stable and auto-collapses when a live run settles', () => {
    const live = turn('turn-1', 0, userMsg('user-1', 0), tool('tool-1', 1, 'running'));
    const settled = { ...live, outcome: { kind: 'done' as const } };
    const activeUnits = flattenTier(
      [live],
      groupedCtx({ active: true, activeTurnId: 'turn-1' }),
      STUB_SEGMENTERS
    );
    const committedUnits = flattenTier([settled], groupedCtx(), STUB_SEGMENTERS);

    expect(activeUnits.find((unit) => unit.kind === 'execution-group')?.id).toBe(
      committedUnits.find((unit) => unit.kind === 'execution-group')?.id
    );
    expect(activeUnits.find((unit) => unit.kind === 'execution-group')?.data).toMatchObject({
      expanded: true,
      toggleId: 'turn-1:execution:hide',
    });
    expect(committedUnits.find((unit) => unit.kind === 'execution-group')?.data).toMatchObject({
      expanded: false,
      toggleId: 'turn-1:execution',
    });
  });
});

describe('collectUserTurnUnits', () => {
  it('returns empty array when no user messages', () => {
    const tx = createTranscript();
    tx.history.seed([turn('t1', 0, tool('a'))]);
    expect(collectUserTurnUnits(tx.state.committedTurns, flattenAll(tx))).toEqual([]);
  });

  it('returns correct unit indices for committed user messages only', () => {
    const tx = createTranscript();
    tx.history.seed([
      turn('t1', 0, userMsg('u1', 0), tool('t1', 1), userMsg('u2', 2), tool('t2', 3)),
    ]);
    driveEvent(tx, { type: 'message_chunk', id: 'streaming', role: 'user', text: 'hi' });
    const view = flattenAll(tx);
    const indices = collectUserTurnUnits(tx.state.committedTurns, view);
    expect(indices).toEqual([0, 2]);
  });
});
