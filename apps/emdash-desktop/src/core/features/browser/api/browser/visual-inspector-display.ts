import type { VisualSelection } from '../../browser/visual-inspector/protocol';

/** Human label for a picked element: component name when known, selector otherwise. */
export function visualSelectionLabel(selection: VisualSelection): string {
  return selection.component.name ?? selection.selector;
}

/** `path/to/File.tsx:47:19` when the page exposed component source, else null. */
export function visualSelectionSource(selection: VisualSelection): string | null {
  const { filePath, lineNumber, columnNumber } = selection.component;
  if (!filePath) return null;
  return [filePath, lineNumber, columnNumber]
    .filter((part) => part !== undefined && part !== null)
    .join(':');
}

export function redactionSummary(selection: VisualSelection): string | null {
  if (selection.redactions.length === 0) return null;
  return selection.redactions.join(', ');
}
