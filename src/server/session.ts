import { randomBytes } from 'node:crypto';
import type { Chat, ChatMessage, Snapshot, MessageStatus } from '../shared/types.js';
import { AppError, publicError } from './errors.js';
import { GreenApiClient, type GreenApi, type Notification } from './green-api.js';
import type { Credentials } from './validation.js';

const SESSION_IDLE_MS = 30 * 60 * 1000;
const MAX_MESSAGES_PER_CHAT = 500;

export interface Session {
  id: string;
  credentials: Credentials;
  api: GreenApi;
  state: string;
  chats: Map<string, Chat>;
  lastActivity: number;
  active: boolean;
  syncError?: string;
  pollTask?: Promise<void>;
}

type ApiFactory = (credentials: Credentials) => GreenApi;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function incomingMessage(notification: Notification): ChatMessage | null {
  const body = notification.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return null;
  const sender = body.senderData as Record<string, unknown> | undefined;
  const data = body.messageData as Record<string, unknown> | undefined;
  const text = data?.textMessageData as Record<string, unknown> | undefined;
  if (
    data?.typeMessage !== 'textMessage' ||
    typeof sender?.chatId !== 'string' ||
    typeof body.idMessage !== 'string' ||
    typeof text?.textMessage !== 'string'
  ) return null;
  return {
    id: body.idMessage,
    chatId: sender.chatId,
    text: text.textMessage,
    direction: 'incoming',
    timestamp: typeof body.timestamp === 'number' ? body.timestamp * 1000 : Date.now(),
  };
}

function updateMessageStatus(session: Session, notification: Notification): void {
  const body = notification.body;
  if (body.typeWebhook !== 'outgoingMessageStatus' || typeof body.idMessage !== 'string') return;
  const rawStatus = body.status;
  const valid: MessageStatus[] = ['sent', 'delivered', 'read', 'failed'];
  if (!valid.includes(rawStatus as MessageStatus)) return;
  for (const chat of session.chats.values()) {
    const message = chat.messages.find((item) => item.id === body.idMessage);
    if (message && message.direction === 'outgoing') {
      message.status = rawStatus as MessageStatus;
      return;
    }
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly instanceOwners = new Map<string, string>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly apiFactory: ApiFactory = (credentials) => new GreenApiClient(credentials),
    private readonly autoPoll = true,
  ) {
    this.cleanupTimer = setInterval(() => this.removeExpired(), 60_000);
    this.cleanupTimer.unref();
  }

  private key(credentials: Credentials): string {
    return `${credentials.apiUrl}|${credentials.idInstance}`;
  }

  async create(credentials: Credentials): Promise<Session> {
    this.removeExpired();
    const instanceKey = this.key(credentials);
    if (this.instanceOwners.has(instanceKey)) {
      throw new AppError('INSTANCE_IN_USE', 'Этот инстанс уже подключён в другой сессии.', 409);
    }
    const id = randomBytes(32).toString('hex');
    this.instanceOwners.set(instanceKey, id);
    try {
      const api = this.apiFactory(credentials);
      const state = await api.getState();
      if (state !== 'authorized') {
        throw new AppError('INSTANCE_UNAVAILABLE', `Инстанс сейчас в состоянии «${state}». Авторизуйте его в кабинете GREEN-API.`, 503);
      }
      const session: Session = {
        id, credentials, api, state, chats: new Map(), lastActivity: Date.now(), active: true,
      };
      this.sessions.set(id, session);
      if (this.autoPoll) session.pollTask = this.poll(session);
      return session;
    } catch (error) {
      if (this.instanceOwners.get(instanceKey) === id) this.instanceOwners.delete(instanceKey);
      throw error;
    }
  }

  get(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.lastActivity > SESSION_IDLE_MS) {
      this.remove(id);
      return undefined;
    }
    session.lastActivity = Date.now();
    return session;
  }

  remove(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.active = false;
    this.sessions.delete(id);
    this.instanceOwners.delete(this.key(session.credentials));
    session.chats.clear();
  }

  private removeExpired(): void {
    for (const [id, session] of this.sessions) {
      if (Date.now() - session.lastActivity > SESSION_IDLE_MS) this.remove(id);
    }
  }

  async addChat(session: Session, phoneNumber: string): Promise<Chat> {
    const result = await session.api.checkAccount(phoneNumber);
    if (!result.exist || !result.chatId) {
      throw new AppError('RECIPIENT_NOT_FOUND', 'Аккаунт MAX для этого номера не найден.', 404);
    }
    const existing = session.chats.get(result.chatId);
    if (existing) return existing;
    const chat: Chat = {
      chatId: result.chatId,
      phoneNumber,
      name: `+${phoneNumber}`,
      createdAt: Date.now(),
      messages: [],
    };
    session.chats.set(chat.chatId, chat);
    return chat;
  }

  async send(session: Session, chatId: string, text: string): Promise<ChatMessage> {
    const chat = session.chats.get(chatId);
    if (!chat) throw new AppError('CHAT_NOT_FOUND', 'Чат не найден.', 404);
    const id = await session.api.sendMessage(chatId, text);
    if (chat.messages.some((item) => item.id === id)) {
      return chat.messages.find((item) => item.id === id)!;
    }
    const message: ChatMessage = {
      id,
      chatId,
      text,
      direction: 'outgoing',
      timestamp: Date.now(),
      status: 'queued',
    };
    chat.messages.push(message);
    this.trim(chat);
    return message;
  }

  async pollOnce(session: Session): Promise<boolean> {
    if (!session.active) return false;
    const notification = await session.api.receiveNotification();
    if (!session.active) return false;
    if (!notification) return false;
    if (!Number.isSafeInteger(notification.receiptId) || !notification.body || typeof notification.body !== 'object') {
      throw new AppError('UPSTREAM_ERROR', 'Получено некорректное уведомление.', 502);
    }
    const incoming = incomingMessage(notification);
    if (incoming) {
      const chat = session.chats.get(incoming.chatId);
      if (chat && !chat.messages.some((item) => item.id === incoming.id)) {
        chat.messages.push(incoming);
        this.trim(chat);
      }
    } else {
      updateMessageStatus(session, notification);
    }
    await session.api.deleteNotification(notification.receiptId);
    return true;
  }

  private trim(chat: Chat): void {
    if (chat.messages.length > MAX_MESSAGES_PER_CHAT) {
      chat.messages.splice(0, chat.messages.length - MAX_MESSAGES_PER_CHAT);
    }
  }

  private async poll(session: Session): Promise<void> {
    let failures = 0;
    while (session.active) {
      try {
        const received = await this.pollOnce(session);
        session.syncError = undefined;
        failures = 0;
        if (!received) await pause(1200);
      } catch (error) {
        session.syncError = publicError(error).message;
        failures += 1;
        await pause(Math.min(30_000, 1000 * 2 ** Math.min(failures, 5)));
      }
    }
  }

  snapshot(session: Session | undefined): Snapshot {
    if (!session) return { connected: false, chats: [] };
    const chats = [...session.chats.values()]
      .map((chat) => ({ ...chat, messages: [...chat.messages] }))
      .sort((a, b) => (b.messages.at(-1)?.timestamp ?? b.createdAt) - (a.messages.at(-1)?.timestamp ?? a.createdAt));
    return {
      connected: true,
      instanceId: session.credentials.idInstance,
      state: session.state,
      chats,
      syncError: session.syncError,
    };
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    for (const id of this.sessions.keys()) this.remove(id);
  }
}
