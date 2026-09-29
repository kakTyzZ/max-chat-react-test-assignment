import { describe, expect, it } from 'vitest';
import { SessionManager } from './session.js';
import type { GreenApi } from './green-api.js';

const credentials = { apiUrl: 'https://3100.api.green-api.com', idInstance: '3100000000', apiTokenInstance: 'abcdef0123456789' };

describe('instance ownership', () => {
  it('reserves an instance before the async state check and releases it on failure', async () => {
    let finish!: (state: string) => void;
    const state = new Promise<string>((resolve) => { finish = resolve; });
    const api = { getState: () => state } as GreenApi;
    const manager = new SessionManager(() => api, false);
    try {
      const first = manager.create(credentials);
      await expect(manager.create(credentials)).rejects.toMatchObject({ code: 'INSTANCE_IN_USE' });
      finish('notAuthorized');
      await expect(first).rejects.toMatchObject({ code: 'INSTANCE_UNAVAILABLE' });
      await expect(manager.create(credentials)).rejects.toMatchObject({ code: 'INSTANCE_UNAVAILABLE' });
    } finally {
      manager.dispose();
    }
  });
});
