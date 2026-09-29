import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from './app.js';
import { SessionManager } from './session.js';
import type { GreenApi, Notification } from './green-api.js';

class FakeGreenApi implements GreenApi {
  state = 'authorized';
  queue: Notification[] = [];
  deleted: number[] = [];
  failDelete = false;
  sent: Array<{ chatId: string; text: string }> = [];

  async getState() { return this.state; }
  async checkAccount(phoneNumber: string) {
    return phoneNumber === '79991234567' ? { exist: true, chatId: '10000000' } : { exist: false, chatId: '' };
  }
  async sendMessage(chatId: string, text: string) {
    this.sent.push({ chatId, text });
    return `out-${this.sent.length}`;
  }
  async receiveNotification() { return this.queue[0] ?? null; }
  async deleteNotification(receiptId: number) {
    if (this.failDelete) throw new Error('temporary failure');
    this.deleted.push(receiptId);
    this.queue.shift();
  }
}

const credentials = {
  apiUrl: 'https://3100.api.green-api.com',
  idInstance: '3100000000',
  apiTokenInstance: 'abcdef0123456789',
};

function incoming(receiptId: number): Notification {
  return {
    receiptId,
    body: {
      typeWebhook: 'incomingMessageReceived',
      idMessage: 'in-1',
      timestamp: 1763115112,
      senderData: { chatId: '10000000' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Ответ из MAX' } },
    },
  };
}

describe('chat API', () => {
  let fake: FakeGreenApi;
  let manager: SessionManager;
  let app: Express;
  let cookie: string;

  beforeEach(async () => {
    fake = new FakeGreenApi();
    manager = new SessionManager(() => fake, false);
    app = createApp(manager);
    const response = await request(app).post('/api/session').send(credentials);
    expect(response.status).toBe(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });

  afterEach(() => manager.dispose());

  it('creates a chat from CheckAccount and sends to the canonical chatId', async () => {
    const chat = await request(app).post('/api/chats').set('Cookie', cookie).send({ phoneNumber: '+7 (999) 123-45-67' });
    expect(chat.status).toBe(201);
    expect(chat.body.chatId).toBe('10000000');
    const sent = await request(app).post('/api/chats/10000000/messages').set('Cookie', cookie).send({ text: 'Привет!' });
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe('queued');
    expect(fake.sent).toEqual([{ chatId: '10000000', text: 'Привет!' }]);
  });

  it('shows an incoming reply once and acknowledges its notification', async () => {
    await request(app).post('/api/chats').set('Cookie', cookie).send({ phoneNumber: '79991234567' });
    const session = manager.get(cookie.split('=')[1])!;
    fake.queue.push(incoming(101));
    await manager.pollOnce(session);
    expect(fake.deleted).toEqual([101]);
    fake.queue.push(incoming(102));
    await manager.pollOnce(session);
    const response = await request(app).get('/api/session').set('Cookie', cookie);
    expect(response.body.chats[0].messages).toHaveLength(1);
    expect(response.body.chats[0].messages[0].text).toBe('Ответ из MAX');
  });

  it('does not duplicate a message when acknowledgment fails and notification repeats', async () => {
    await request(app).post('/api/chats').set('Cookie', cookie).send({ phoneNumber: '79991234567' });
    const session = manager.get(cookie.split('=')[1])!;
    fake.queue.push(incoming(101));
    fake.failDelete = true;
    await expect(manager.pollOnce(session)).rejects.toThrow();
    fake.failDelete = false;
    await manager.pollOnce(session);
    expect(manager.snapshot(session).chats[0].messages).toHaveLength(1);
    expect(fake.deleted).toEqual([101]);
  });

  it('reports a missing recipient, blocks cross-origin writes and clears the session', async () => {
    const missing = await request(app).post('/api/chats').set('Cookie', cookie).send({ phoneNumber: '79990000000' });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('RECIPIENT_NOT_FOUND');
    const crossOrigin = await request(app).post('/api/chats').set('Cookie', cookie).set('Origin', 'https://evil.example').send({ phoneNumber: '79991234567' });
    expect(crossOrigin.status).toBe(403);
    await request(app).delete('/api/session').set('Cookie', cookie).expect(204);
    const snapshot = await request(app).get('/api/session').set('Cookie', cookie);
    expect(snapshot.body.connected).toBe(false);
  });

  it('never includes the token in session responses', async () => {
    const response = await request(app).get('/api/session').set('Cookie', cookie);
    expect(JSON.stringify(response.body)).not.toContain(credentials.apiTokenInstance);
  });

  it('does not acknowledge a notification after disconnect', async () => {
    const session = manager.get(cookie.split('=')[1])!;
    fake.queue.push(incoming(202));
    manager.remove(session.id);
    expect(await manager.pollOnce(session)).toBe(false);
    expect(fake.deleted).toEqual([]);
  });
});
