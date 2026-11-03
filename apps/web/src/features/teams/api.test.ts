import { describe, expect, it } from 'vitest';
import { participantName } from './api';

describe('teams helpers', () => {
  it('names a participant from username, then sub, then id', () => {
    expect(participantName({ user_id: 1, role: 'red', username: 'ana', sub: 'x' })).toBe('ana');
    expect(participantName({ user_id: 2, role: 'red', sub: 'bob' })).toBe('bob');
    expect(participantName({ user_id: 3, role: 'red' })).toBe('User 3');
  });
});
