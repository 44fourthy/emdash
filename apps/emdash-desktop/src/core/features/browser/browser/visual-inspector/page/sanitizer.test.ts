import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  attributeNameTokens,
  isSensitiveAttributeName,
  redactFreeText,
  redactMarkup,
  sanitizeAttributes,
  sanitizeText,
} from './sanitizer';

describe('attribute names', () => {
  it('flags credential-shaped names and leaves layout attributes alone', () => {
    expect(isSensitiveAttributeName('data-testid')).toBe(false);
    expect(isSensitiveAttributeName('aria-label')).toBe(false);
    expect(isSensitiveAttributeName('autocomplete')).toBe(false);
    expect(isSensitiveAttributeName('data-author')).toBe(false);
    expect(isSensitiveAttributeName('placeholder')).toBe(false);

    expect(isSensitiveAttributeName('value')).toBe(false);
    expect(isSensitiveAttributeName('data-token')).toBe(true);
    expect(isSensitiveAttributeName('apiKey')).toBe(true);
    expect(isSensitiveAttributeName('X-Api-Key')).toBe(true);
    expect(isSensitiveAttributeName('data-session-id')).toBe(true);
    expect(isSensitiveAttributeName('client_secret')).toBe(true);
  });

  it('splits camelCase and separators into comparable tokens', () => {
    expect(attributeNameTokens('apiKey')).toEqual(['api', 'key']);
    expect(attributeNameTokens('x_api-key')).toEqual(['x', 'api', 'key']);
  });
});

describe('attribute sanitizing', () => {
  it('masks sensitive values but records that a redaction happened', () => {
    const result = sanitizeAttributes(
      [
        ['class', 'create-order'],
        ['data-token', 'tok_live_123'],
      ],
      { passwordField: false, maxValueLength: 200 }
    );
    expect(result.attributes.class).toBe('create-order');
    expect(result.attributes['data-token']).toBe(REDACTED);
    expect(result.redactions).toBe(true);
  });

  it('masks input values for password fields even without a sensitive name', () => {
    const result = sanitizeAttributes([['value', 'hunter2']], {
      passwordField: true,
      maxValueLength: 200,
    });
    expect(result.attributes.value).toBe(REDACTED);
    expect(result.redactions).toBe(true);
  });

  it('truncates long attribute values', () => {
    const result = sanitizeAttributes([['title', 'x'.repeat(50)]], {
      passwordField: false,
      maxValueLength: 10,
    });
    expect(result.attributes.title).toBe('x'.repeat(10));
  });
});

describe('text sanitizing', () => {
  it('drops password field text entirely', () => {
    expect(sanitizeText('secret typed here', { passwordField: true })).toBe('');
  });

  it('redacts credential-shaped strings in free text', () => {
    const text = redactFreeText('key sk-abcdefghijklmnopqrstuvwx and ghp_abcdefghijklmnopqrst');
    expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrst');
    expect(text).toContain(REDACTED);
  });

  it('redacts bearer tokens and key=value pairs', () => {
    expect(redactFreeText('Authorization: Bearer eyJhbGciOi.J9abc.defghi')).not.toContain(
      'eyJhbGciOi'
    );
    expect(redactFreeText('api_key=abc123')).toBe(`api_key=${REDACTED}`);
  });

  it('leaves ordinary copy untouched', () => {
    expect(redactFreeText('Total: $1,204.00')).toBe('Total: $1,204.00');
  });
});

describe('markup sanitizing', () => {
  it('masks sensitive attributes inside tags', () => {
    const html = '<button class="create-order" data-token="tok_live_9">Create Order</button>';
    expect(redactMarkup(html, { passwordField: false })).toBe(
      `<button class="create-order" data-token="${REDACTED}">Create Order</button>`
    );
  });

  it('masks password input values but keeps the rest of the tag', () => {
    const html = '<input type="password" name="password" value="hunter2">';
    const result = redactMarkup(html, { passwordField: true });
    expect(result).toContain(`value="${REDACTED}"`);
    expect(result).toContain('type="password"');
    expect(result).not.toContain('hunter2');
  });

  it('does not rewrite text that merely looks like an attribute assignment', () => {
    const html = '<div>total = 5 items</div>';
    expect(redactMarkup(html, { passwordField: false })).toBe(html);
  });
});
