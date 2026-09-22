/**
 * Redaction for captured UI context. Runs inside the inspected page, before the
 * payload crosses into the app, so secrets never leave the webview.
 *
 * Deliberately conservative: we never read cookies, storage, or requests, and
 * we over-redact attribute names rather than risk leaking a credential.
 */

export const REDACTED = '[redacted]';

/**
 * Matched per name token, so `x-api-key`, `apiKey`, and `client_secret` are all
 * covered without enumerating every spelling. Bare `key` and `session` are
 * included on purpose: over-redacting a list key is cheaper than leaking a
 * credential.
 */
const SENSITIVE_TOKENS = new Set([
  'password',
  'passwords',
  'passwd',
  'pwd',
  'passphrase',
  'secret',
  'secrets',
  'token',
  'tokens',
  'credential',
  'credentials',
  'cookie',
  'cookies',
  'bearer',
  'jwt',
  'key',
  'session',
  'signature',
  'authorization',
  'authorisation',
  'cvv',
  'cvc',
  'ssn',
  'otp',
  'csrf',
  'xsrf',
]);

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
];

const KEY_VALUE_PATTERN =
  /\b(password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|authorization)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;

const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Splits an attribute name into lowercase words: `apiKey` -> `api`,`key`, `x_api-key` -> `x`,`api`,`key`. */
export function attributeNameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveAttributeName(name: string): boolean {
  return attributeNameTokens(name).some((token) => SENSITIVE_TOKENS.has(token));
}

/**
 * Password-like fields are redacted wholesale: their value is never captured,
 * even when the input carries no sensitive-looking attribute name.
 */
export function isPasswordElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName !== 'input' && tagName !== 'textarea') return false;
  const type = (element.getAttribute('type') ?? '').toLowerCase();
  if (type === 'password') return true;
  if ((element.getAttribute('autocomplete') ?? '').toLowerCase().includes('password')) return true;
  return false;
}

export function redactFreeText(value: string): string {
  let next = value;
  for (const pattern of CREDENTIAL_PATTERNS) {
    next = next.replace(pattern, REDACTED);
  }
  return next.replace(
    KEY_VALUE_PATTERN,
    (_match, key: string, separator: string, assigned?: string) => {
      // Keep the quoting style so masking an attribute does not rewrite the markup.
      const quote = assigned?.startsWith('"') ? '"' : assigned?.startsWith("'") ? "'" : '';
      return `${key}${separator}${quote}${REDACTED}${quote}`;
    }
  );
}

const TAG_PATTERN = /<[^>]*>/g;

/**
 * Redacts credential-shaped attributes inside a markup string, keeping the shape
 * readable. Only tag interiors are rewritten so text like `total = 5` survives.
 */
export function redactMarkup(markup: string, options: { passwordField: boolean }): string {
  const withAttributes = markup.replace(TAG_PATTERN, (tag) =>
    tag.replace(
      ATTRIBUTE_PATTERN,
      (match, rawName: string, _assignment: string, doubleQuoted, singleQuoted, bare) => {
        const name = String(rawName);
        const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
        const sensitive =
          isSensitiveAttributeName(name) ||
          (options.passwordField && name.toLowerCase() === 'value');
        if (!sensitive) return match;
        return `${name}="${hasContent(value) ? REDACTED : ''}"`;
      }
    )
  );
  return redactFreeText(withAttributes);
}

function hasContent(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export type SanitizedAttributes = {
  attributes: Record<string, string>;
  redactions: boolean;
};

export function sanitizeAttributes(
  input: Iterable<readonly [string, string]>,
  options: { passwordField: boolean; maxValueLength: number }
): SanitizedAttributes {
  const attributes: Record<string, string> = {};
  let redactions = false;
  for (const [name, rawValue] of input) {
    const sensitive =
      isSensitiveAttributeName(name) || (options.passwordField && name.toLowerCase() === 'value');
    if (sensitive) {
      redactions = true;
      attributes[name] = hasContent(rawValue) ? REDACTED : '';
      continue;
    }
    attributes[name] = redactFreeText(rawValue).slice(0, options.maxValueLength);
  }
  return { attributes, redactions };
}

export function sanitizeText(value: string, options: { passwordField: boolean }): string {
  if (options.passwordField) return '';
  return redactFreeText(value);
}
