import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreenApiClient } from './green-api.js';

const client = new GreenApiClient({
  apiUrl: 'https://3100.api.green-api.com',
  idInstance: '3100000000',
  apiTokenInstance: 'testtoken12345678',
});

afterEach(() => vi.unstubAllGlobals());

describe('GREEN-API HTTP adapter', () => {
  it('uses the documented paths, methods and bodies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ stateInstance: 'authorized' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ exist: true, chatId: '10000000' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ idMessage: 'out-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ receiptId: 7, body: { typeWebhook: 'incomingMessageReceived' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('true', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await client.getState()).toBe('authorized');
    expect(await client.checkAccount('79991234567')).toEqual({ exist: true, chatId: '10000000' });
    expect(await client.sendMessage('10000000', 'Привет')).toBe('out-1');
    expect((await client.receiveNotification())?.receiptId).toBe(7);
    await client.deleteNotification(7);

    const requests = fetchMock.mock.calls.map(([url, init]) => ({ url, method: init.method, body: init.body, redirect: init.redirect }));
    expect(requests.map((item) => item.method)).toEqual(['GET', 'POST', 'POST', 'GET', 'DELETE']);
    expect(requests.map((item) => item.url)).toEqual([
      'https://3100.api.green-api.com/waInstance3100000000/getStateInstance/testtoken12345678',
      'https://3100.api.green-api.com/waInstance3100000000/checkAccount/testtoken12345678',
      'https://3100.api.green-api.com/waInstance3100000000/sendMessage/testtoken12345678',
      'https://3100.api.green-api.com/waInstance3100000000/receiveNotification/testtoken12345678?receiveTimeout=5',
      'https://3100.api.green-api.com/waInstance3100000000/deleteNotification/testtoken12345678/7',
    ]);
    expect(JSON.parse(requests[1].body)).toEqual({ phoneNumber: 79991234567 });
    expect(JSON.parse(requests[2].body)).toEqual({ chatId: '10000000', message: 'Привет' });
    expect(requests.every((item) => item.redirect === 'error')).toBe(true);
  });

  it('returns safe errors for upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret details', { status: 429 })));
    await expect(client.getState()).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });
});
