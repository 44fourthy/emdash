import { describe, expect, it } from 'vitest';
import { normalizeForgeHost } from './forge-host';

describe('normalizeForgeHost', () => {
  it('folds github.com ssh aliases onto github.com', () => {
    expect(normalizeForgeHost('github.com-rc3r0')).toBe('github.com');
    expect(normalizeForgeHost('github.com-lif')).toBe('github.com');
    expect(normalizeForgeHost('github.com-work_2')).toBe('github.com');
    expect(normalizeForgeHost('GITHUB.COM-Personal')).toBe('github.com');
    expect(normalizeForgeHost('  github.com-rc3r0  ')).toBe('github.com');
  });

  it('folds the www prefix', () => {
    expect(normalizeForgeHost('www.github.com')).toBe('github.com');
  });

  it('leaves plain and unrelated hosts alone', () => {
    expect(normalizeForgeHost('github.com')).toBe('github.com');
    expect(normalizeForgeHost('gitlab.example.com')).toBe('gitlab.example.com');
    expect(normalizeForgeHost('ghe.example.com')).toBe('ghe.example.com');
  });

  it('never folds a lookalike host into github.com', () => {
    // Any further dot disqualifies the alias form, so a hostile host cannot
    // inherit github.com's configuration or credentials.
    expect(normalizeForgeHost('github.com.evil.example')).toBe('github.com.evil.example');
    expect(normalizeForgeHost('github.com-evil.example')).toBe('github.com-evil.example');
    expect(normalizeForgeHost('notgithub.com-x')).toBe('notgithub.com-x');
    expect(normalizeForgeHost('github.com.x')).toBe('github.com.x');
  });
});
