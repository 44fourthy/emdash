import { asAgentProviderId } from '@emdash/plugins/agents/types';
import { describe, expect, it } from 'vitest';
import { isGeneratedConversationTitle } from './conversation-title-utils';

const provider = asAgentProviderId('opencode');

describe('isGeneratedConversationTitle', () => {
  it('recognises the titles we generate', () => {
    expect(isGeneratedConversationTitle('opencode (1)', provider)).toBe(true);
    expect(isGeneratedConversationTitle('opencode (12)', provider)).toBe(true);
    expect(isGeneratedConversationTitle('Opencode (2)', provider)).toBe(true);
  });

  it('treats anything the user wrote as theirs', () => {
    // The caller replaces only generated titles, so a renamed conversation
    // must fail this — including a title that merely looks similar.
    expect(isGeneratedConversationTitle('Reset Heroku DB', provider)).toBe(false);
    expect(isGeneratedConversationTitle('opencode (0)', provider)).toBe(false);
    expect(isGeneratedConversationTitle('opencode (notes)', provider)).toBe(false);
    expect(isGeneratedConversationTitle('opencode (2) extra', provider)).toBe(false);
    expect(isGeneratedConversationTitle('claude (1)', provider)).toBe(false);
    expect(isGeneratedConversationTitle('', provider)).toBe(false);
  });
});
