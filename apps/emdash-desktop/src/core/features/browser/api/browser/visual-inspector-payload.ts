import type { VisualSelection } from '../../browser/visual-inspector/protocol';
import { visualSelectionLabel, visualSelectionSource } from './visual-inspector-display';
import type { VisualAnnotation } from './visual-inspector-store';

const MAX_PROMPT_LENGTH = 32_000;
const NO_INSTRUCTION = '(no instruction provided)';
const TRUNCATION_NOTICE = '\n\n[Context truncated: payload exceeded the size limit.]';

export function hasSendableInstruction(annotations: readonly VisualAnnotation[]): boolean {
  return annotations.some((annotation) => annotation.instruction.trim().length > 0);
}

/**
 * Formats picked elements and their instructions into the message handed to the
 * active agent. Plain text on purpose: it lands in the conversation transcript,
 * so it stays readable and copyable there.
 */
export function buildVisualContextPrompt(annotations: readonly VisualAnnotation[]): string {
  if (annotations.length === 0) return '';
  const multiple = annotations.length > 1;
  const blocks = annotations.map((annotation, index) =>
    formatAnnotation(annotation, index + 1, annotations.length)
  );
  const closing = multiple ? '\n\nApply every request above.' : '';
  const prompt = [
    'UI ELEMENT FEEDBACK',
    '',
    'The user selected the element(s) below in the app running in Emdash and asked for the',
    'change(s) noted under "User request". Use the source location, selector, and styles to',
    'make the change in this codebase.',
    '',
    blocks.join('\n\n'),
    closing,
  ].join('\n');

  return prompt.length > MAX_PROMPT_LENGTH
    ? prompt.slice(0, MAX_PROMPT_LENGTH - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE
    : prompt;
}

function formatAnnotation(annotation: VisualAnnotation, position: number, total: number): string {
  const selection = annotation.selection;
  const lines: string[] = [
    total > 1 ? `=== Element ${position} of ${total} ===` : '=== Element ===',
  ];

  lines.push(`Page: ${selection.url || '(unknown)'}`);
  if (selection.pageTitle) lines.push(`Page title: ${selection.pageTitle}`);
  lines.push(`Selected: ${visualSelectionLabel(selection)}`);
  const source = visualSelectionSource(selection);
  if (source) lines.push(`Source: ${source}`);
  if (selection.component.stack.length > 0) {
    lines.push('Component stack:');
    for (const frame of selection.component.stack) lines.push(indent(frame, 2));
  }
  if (selection.snippet) lines.push(`React Grab snippet: ${selection.snippet}`);
  lines.push(`Selector: ${selection.selector}`);
  if (selection.xpath) lines.push(`XPath: ${selection.xpath}`);
  const identity = [selection.tagName, selection.id ? `#${selection.id}` : '', classList(selection)]
    .filter(Boolean)
    .join(' ');
  lines.push(`Element: ${identity}`);
  if (selection.text) lines.push(`Text: ${quote(selection.text)}`);

  const html = selection.html.trim();
  if (html) {
    lines.push('HTML (truncated):');
    for (const chunk of html.split('\n')) lines.push(indent(chunk, 2));
  }

  const styles = Object.entries(selection.styles);
  if (styles.length > 0) {
    lines.push('Relevant styles:');
    for (const [property, value] of styles) lines.push(indent(`${property}: ${value};`, 2));
  }

  const bounds = selection.bounds;
  lines.push(
    `Bounding box: x=${bounds.x} y=${bounds.y} width=${bounds.width} height=${bounds.height} (viewport px)`
  );

  const container = containerLabel(selection);
  if (container) lines.push(`Container: ${container}`);

  const aria = accessibilityLabel(selection);
  if (aria) lines.push(`Accessibility: ${aria}`);

  const attributes = Object.entries(selection.attributes);
  if (attributes.length > 0) {
    lines.push(
      `Attributes: ${attributes.map(([name, value]) => `${name}=${quote(value)}`).join(' ')}`
    );
  }

  if (selection.redactions.length > 0) {
    lines.push(`Redacted before sending: ${selection.redactions.join(', ')}`);
  }

  lines.push('', `User request: ${annotation.instruction.trim() || NO_INSTRUCTION}`);
  return lines.join('\n');
}

function containerLabel(selection: VisualSelection): string | null {
  const [parent, ...rest] = selection.ancestors;
  if (!parent) return null;
  const chain = [parent, ...rest]
    .slice(0, 3)
    .map((node) => node.selector)
    .reverse()
    .join(' > ');
  const position =
    selection.siblingIndex && selection.siblingCount
      ? ` (child ${selection.siblingIndex} of ${selection.siblingCount})`
      : '';
  return `${chain}${position}`;
}

function accessibilityLabel(selection: VisualSelection): string | null {
  const parts: string[] = [];
  if (selection.aria.role) parts.push(`role=${selection.aria.role}`);
  if (selection.aria.label) parts.push(`aria-label=${quote(selection.aria.label)}`);
  for (const [name, value] of Object.entries(selection.aria.attributes)) {
    if (name === 'aria-label') continue;
    parts.push(`${name}=${quote(value)}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function classList(selection: VisualSelection): string {
  return selection.classes.map((name) => `.${name}`).join('');
}

function indent(value: string, spaces: number): string {
  const padding = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${padding}${line}`)
    .join('\n');
}

function quote(value: string): string {
  return JSON.stringify(value);
}
