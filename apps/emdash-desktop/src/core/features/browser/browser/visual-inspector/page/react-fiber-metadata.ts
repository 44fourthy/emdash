/**
 * React component name and owner stack for a DOM element.
 *
 * React Grab resolves these through bippy's devtools instrumentation, which only
 * sees renderers that registered after its hook was installed. The inspector is
 * injected long after the page booted, so that path often comes back empty; this
 * reads the fiber React itself attaches to the DOM node instead. Production
 * builds simply have no `_debugSource`, leaving names without file locations.
 */

const FIBER_KEY_PREFIXES = ['__reactFiber$', '__reactInternalInstance$'];
const MAX_STACK_DEPTH = 12;
const WRAPPER_NAMES = new Set([
  'Fragment',
  'Suspense',
  'StrictMode',
  'Profiler',
  'Provider',
  'Consumer',
  'Context',
  'Anonymous',
  'Root',
  'AppContainer',
]);

export type FiberMetadata = {
  name: string | null;
  stack: string[];
};

type FiberLike = {
  type?: unknown;
  elementType?: unknown;
  return?: FiberLike | null;
  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number } | null;
};

export function readFiberMetadata(element: Element): FiberMetadata {
  const fiber = fiberFor(element);
  if (!fiber) return { name: null, stack: [] };

  const stack: string[] = [];
  let cursor: FiberLike | null = fiber;
  while (cursor && stack.length < MAX_STACK_DEPTH) {
    const name = componentName(cursor);
    if (name) stack.push(describe(name, cursor._debugSource ?? null));
    cursor = cursor.return ?? null;
  }
  return { name: stripLocation(stack[0] ?? null), stack };
}

function fiberFor(element: Element): FiberLike | null {
  const keys = Object.keys(element);
  for (const prefix of FIBER_KEY_PREFIXES) {
    const key = keys.find((candidate) => candidate.startsWith(prefix));
    if (!key) continue;
    const value = (element as unknown as Record<string, unknown>)[key];
    if (value && typeof value === 'object') return value as FiberLike;
  }
  return null;
}

function componentName(fiber: FiberLike): string | null {
  const type = fiber.type ?? fiber.elementType;
  if (typeof type === 'string' || type === null || type === undefined) return null;
  if (typeof type !== 'function' && typeof type !== 'object') return null;
  const candidate =
    readName(type, 'displayName') ??
    readName(type, 'name') ??
    readName(readType(type), 'displayName') ??
    readName(readType(type), 'name');
  if (!candidate || WRAPPER_NAMES.has(candidate)) return null;
  return candidate;
}

function readType(type: object): object | null {
  const inner = (type as { type?: unknown }).type;
  return inner && typeof inner === 'object' ? inner : null;
}

function readName(value: unknown, key: 'displayName' | 'name'): string | null {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
  const name = (value as Record<string, unknown>)[key];
  return typeof name === 'string' && name.length > 0 && !name.startsWith('_') ? name : null;
}

function describe(
  name: string,
  source: { fileName?: string; lineNumber?: number; columnNumber?: number } | null
): string {
  if (!source?.fileName) return name;
  const location = [source.fileName, source.lineNumber, source.columnNumber]
    .filter((part) => part !== undefined && part !== null)
    .join(':');
  return `${name} (${location})`;
}

function stripLocation(entry: string | null): string | null {
  if (!entry) return null;
  const locationIndex = entry.indexOf(' (');
  return locationIndex === -1 ? entry : entry.slice(0, locationIndex);
}
